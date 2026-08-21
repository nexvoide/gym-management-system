import Link from "next/link";
import { and, desc, eq, gt, like, or, sql, type SQL } from "drizzle-orm";
import { BanknoteArrowUp, CircleDollarSign, CreditCard, ReceiptText, Search } from "lucide-react";
import { db } from "@/db";
import { gyms, invoices, members, payments } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";

type Props = { searchParams: Promise<{ tab?: string; q?: string; status?: string; member?: string }> };

export default async function PaymentsPage({ searchParams }: Props) {
  const user = await requirePermission("payments.read");
  const params = await searchParams, tab = params.tab ?? "invoices";
  const financialAccess = can(user.role, "reports.read");
  const gym = (await db.select({ currency: gyms.currency, locale: gyms.locale, timezone: gyms.timezone }).from(gyms).where(eq(gyms.id, user.gymId)))[0];
  const currentCurrency = gym?.currency ?? "USD", locale = gym?.locale ?? "en-US", timezone = gym?.timezone ?? "UTC";
  const money = (amount: number, currency = currentCurrency) => new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  const date = (value: Date) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: timezone }).format(value);

  // Never combine monetary totals across currencies. Historical rows retain their currency snapshots.
  const totals = (await db.select({
    revenue: sql<number>`coalesce((select sum(amount) from payments where gym_id=${user.gymId} and currency=${currentCurrency}),0)::double precision`,
    outstanding: sql<number>`coalesce(sum(${invoices.balance}),0)::double precision`,
    invoiced: sql<number>`coalesce(sum(${invoices.total}),0)::double precision`,
    unpaid: sql<number>`coalesce(sum(case when ${invoices.balance}>0 then 1 else 0 end),0)::int`,
  }).from(invoices).where(and(eq(invoices.gymId, user.gymId), eq(invoices.currency, currentCurrency))))[0]!;

  const filters: SQL[] = [eq(invoices.gymId, user.gymId)];
  if (params.member) filters.push(eq(invoices.memberId, params.member));
  if (params.status === "outstanding" || tab === "outstanding") filters.push(gt(invoices.balance, 0));
  else if (params.status) filters.push(eq(invoices.status, params.status as typeof invoices.$inferSelect.status));
  if (params.q) {
    const term = `%${params.q}%`;
    filters.push(or(like(invoices.invoiceNumber, term), like(invoices.memberName, term), like(invoices.memberNumberSnapshot, term))!);
  }

  const invoiceRows = tab !== "payments" ? await db.select({
    id: invoices.id, invoiceNumber: invoices.invoiceNumber, memberId: members.id,
    memberName: invoices.memberName, memberNumber: invoices.memberNumberSnapshot,
    dueAt: invoices.dueAt, total: invoices.total, paid: invoices.paid, balance: invoices.balance,
    status: invoices.status, currency: invoices.currency,
  }).from(invoices).innerJoin(members, eq(invoices.memberId, members.id)).where(and(...filters)).orderBy(desc(invoices.issuedAt)).limit(100) : [];

  const paymentRows = tab === "payments" ? await db.select({
    id: payments.id, invoiceId: invoices.id, invoiceNumber: invoices.invoiceNumber, memberId: members.id,
    memberName: invoices.memberName, memberNumber: invoices.memberNumberSnapshot,
    amount: payments.amount, currency: payments.currency, method: payments.method, paidAt: payments.paidAt, reference: payments.reference,
  }).from(payments).innerJoin(invoices, eq(payments.invoiceId, invoices.id)).innerJoin(members, eq(payments.memberId, members.id))
    .where(eq(payments.gymId, user.gymId)).orderBy(desc(payments.paidAt)).limit(100) : [];

  return <div className="content">
    <div className="page-head"><div><div className="eyebrow">Financial ledger</div><h1>Payments</h1><p>Invoices, receipts, and outstanding balances without accounting clutter.</p></div></div>
    {financialAccess && <section className="finance-stats">
      <FinanceStat icon={CircleDollarSign} label={`Revenue received (${currentCurrency})`} value={money(totals.revenue)}/>
      <FinanceStat icon={ReceiptText} label={`Total invoiced (${currentCurrency})`} value={money(totals.invoiced)}/>
      <FinanceStat icon={CreditCard} label={`Outstanding (${currentCurrency})`} value={money(totals.outstanding)}/>
      <FinanceStat icon={BanknoteArrowUp} label="Invoices due" value={String(totals.unpaid)}/>
    </section>}
    <nav className="profile-tabs membership-tabs"><Link className={tab === "invoices" ? "active" : ""} href="/payments?tab=invoices">Invoices</Link><Link className={tab === "outstanding" ? "active" : ""} href="/payments?tab=outstanding">Outstanding</Link><Link className={tab === "payments" ? "active" : ""} href="/payments?tab=payments">Payment history</Link></nav>
    {tab === "payments" ? <PaymentTable rows={paymentRows} date={date} money={money}/>
      : <InvoiceTable rows={invoiceRows} tab={tab} params={params} date={date} money={money}/>} 
  </div>;
}

type Money = (amount: number, currency?: string) => string;
function PaymentTable({ rows, date, money }: { rows: Array<{ id: string; invoiceId: string; invoiceNumber: string; memberId: string; memberName: string; memberNumber: string; amount: number; currency: string; method: string; paidAt: Date; reference: string | null }>; date: (value: Date) => string; money: Money }) {
  return <section className="card table-card"><div className="table-wrap"><table className="data-table"><thead><tr><th>Payment date</th><th>Member</th><th>Invoice</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{date(row.paidAt)}</td><td><Link href={`/members/${row.memberId}?tab=payments`}><strong>{row.memberName}</strong><small className="table-sub">{row.memberNumber}</small></Link></td><td><Link className="link" href={`/payments/invoices/${row.invoiceId}`}>{row.invoiceNumber}</Link></td><td>{row.method}</td><td>{row.reference ?? "—"}</td><td><strong>{money(row.amount, row.currency)}</strong></td></tr>)}</tbody></table></div></section>;
}
function InvoiceTable({ rows, tab, params, date, money }: { rows: Array<{ id: string; invoiceNumber: string; memberId: string; memberName: string; memberNumber: string; dueAt: Date; total: number; paid: number; balance: number; status: string; currency: string }>; tab: string; params: { q?: string; status?: string }; date: (value: Date) => string; money: Money }) {
  return <section className="card table-card"><form className="table-toolbar"><div className="table-search"><Search size={17}/><input name="q" defaultValue={params.q ?? ""} placeholder="Search member or invoice"/><input type="hidden" name="tab" value={tab}/></div><div className="filter-group"><select name="status" defaultValue={params.status ?? ""}><option value="">All statuses</option><option value="paid">Paid</option><option value="partially_paid">Partially paid</option><option value="unpaid">Unpaid</option><option value="overdue">Overdue</option></select><button className="btn btn-secondary btn-sm">Apply</button></div></form><div className="table-wrap"><table className="data-table"><thead><tr><th>Invoice</th><th>Member</th><th>Due date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th /></tr></thead><tbody>{rows.map(row => { const actual = row.balance > 0 && row.dueAt < new Date() ? "overdue" : row.status; return <tr key={row.id}><td><Link className="link mono" href={`/payments/invoices/${row.id}`}>{row.invoiceNumber}</Link></td><td><Link href={`/members/${row.memberId}?tab=payments`}><strong>{row.memberName}</strong><small className="table-sub">{row.memberNumber}</small></Link></td><td>{date(row.dueAt)}</td><td>{money(row.total, row.currency)}</td><td>{money(row.paid, row.currency)}</td><td><strong>{money(row.balance, row.currency)}</strong></td><td><InvoiceBadge status={actual}/></td><td>{row.balance > 0 && <Link className="btn btn-secondary btn-sm" href={`/payments/invoices/${row.id}/pay`}>Record payment</Link>}</td></tr> })}</tbody></table>{!rows.length && <div className="empty-inline">No invoices match these filters.</div>}</div></section>;
}
function FinanceStat({ icon: Icon, label, value }: { icon: typeof CreditCard; label: string; value: string }) { return <article className="card finance-stat"><span><Icon size={18}/></span><div><strong>{value}</strong><small>{label}</small></div></article> }
function InvoiceBadge({ status }: { status: string }) { return <span className={`invoice-badge invoice-${status}`}>{status.replaceAll("_", " ")}</span> }
