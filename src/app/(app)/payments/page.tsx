import Link from "next/link";
import { and, desc, eq, gt, like, or, sql, type SQL } from "drizzle-orm";
import { BanknoteArrowUp, CircleDollarSign, CreditCard, ReceiptText, Search } from "lucide-react";
import { db } from "@/db";
import { gyms, invoices, members, payments } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
type Props = {
    searchParams: Promise<{
        tab?: string;
        q?: string;
        status?: string;
        member?: string;
    }>;
};
export default async function PaymentsPage({ searchParams }: Props) {
    const user = await requirePermission("payments.read");
    const params = await searchParams, tab = params.tab ?? "invoices";
    const financialAccess = can(user.role, "reports.read");
    const gym = (await (db.select({ currency: gyms.currency }).from(gyms)).where(eq(gyms.id, user.gymId)))[0];
    const money = new Intl.NumberFormat("en-PK", { style: "currency", currency: gym?.currency ?? "PKR", maximumFractionDigits: 0 });
    const totals = (await (db.select({ revenue: sql<number> `coalesce((select sum(amount) from payments where gym_id=${user.gymId}),0)::double precision`, outstanding: sql<number> `coalesce(sum(${invoices.balance}),0)::double precision`, invoiced: sql<number> `coalesce(sum(${invoices.total}),0)::double precision`, unpaid: sql<number> `coalesce(sum(case when ${invoices.balance}>0 then 1 else 0 end),0)::int` }).from(invoices)).where(eq(invoices.gymId, user.gymId)))[0]!;
    const filters: SQL[] = [eq(invoices.gymId, user.gymId)];
    if (params.member)
        filters.push(eq(invoices.memberId, params.member));
    if (params.status === "outstanding" || tab === "outstanding")
        filters.push(gt(invoices.balance, 0));
    else if (params.status)
        filters.push(eq(invoices.status, params.status as typeof invoices.$inferSelect.status));
    if (params.q) {
        const term = `%${params.q}%`;
        filters.push(or(like(invoices.invoiceNumber, term), like(members.firstName, term), like(members.lastName, term), like(members.memberNumber, term))!);
    }
    const invoiceRows = tab !== "payments" ? await ((((db.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, memberId: members.id, firstName: members.firstName, lastName: members.lastName, memberNumber: members.memberNumber, issuedAt: invoices.issuedAt, dueAt: invoices.dueAt, total: invoices.total, paid: invoices.paid, balance: invoices.balance, status: invoices.status }).from(invoices)).innerJoin(members, eq(invoices.memberId, members.id))).where(and(...filters))).orderBy(desc(invoices.issuedAt))).limit(100) : [];
    const paymentRows = tab === "payments" ? await (((((db.select({ id: payments.id, invoiceId: invoices.id, invoiceNumber: invoices.invoiceNumber, memberId: members.id, firstName: members.firstName, lastName: members.lastName, memberNumber: members.memberNumber, amount: payments.amount, method: payments.method, paidAt: payments.paidAt, reference: payments.reference }).from(payments)).innerJoin(invoices, eq(payments.invoiceId, invoices.id))).innerJoin(members, eq(payments.memberId, members.id))).where(eq(payments.gymId, user.gymId))).orderBy(desc(payments.paidAt))).limit(100) : [];
    return <div className="content"><div className="page-head"><div><div className="eyebrow">Financial ledger</div><h1>Payments</h1><p>Invoices, receipts, and outstanding balances without accounting clutter.</p></div></div>{financialAccess && <section className="finance-stats"><FinanceStat icon={CircleDollarSign} label="Revenue received" value={money.format(totals.revenue)}/><FinanceStat icon={ReceiptText} label="Total invoiced" value={money.format(totals.invoiced)}/><FinanceStat icon={CreditCard} label="Outstanding" value={money.format(totals.outstanding)}/><FinanceStat icon={BanknoteArrowUp} label="Invoices due" value={String(totals.unpaid)}/></section>}<nav className="profile-tabs membership-tabs"><Link className={tab === "invoices" ? "active" : ""} href="/payments?tab=invoices">Invoices</Link><Link className={tab === "outstanding" ? "active" : ""} href="/payments?tab=outstanding">Outstanding</Link><Link className={tab === "payments" ? "active" : ""} href="/payments?tab=payments">Payment history</Link></nav>{tab === "payments" ? <section className="card table-card"><div className="table-wrap"><table className="data-table"><thead><tr><th>Payment date</th><th>Member</th><th>Invoice</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead><tbody>{paymentRows.map(row => <tr key={row.id}><td>{row.paidAt.toLocaleDateString("en-PK")}</td><td><Link href={`/members/${row.memberId}?tab=payments`}><strong>{row.firstName} {row.lastName}</strong><small className="table-sub">{row.memberNumber}</small></Link></td><td><Link className="link" href={`/payments/invoices/${row.invoiceId}`}>{row.invoiceNumber}</Link></td><td>{row.method}</td><td>{row.reference ?? "—"}</td><td><strong>{money.format(row.amount)}</strong></td></tr>)}</tbody></table></div></section> : <section className="card table-card"><form className="table-toolbar"><div className="table-search"><Search size={17}/><input name="q" defaultValue={params.q ?? ""} placeholder="Search member or invoice"/><input type="hidden" name="tab" value={tab}/></div><div className="filter-group"><select name="status" defaultValue={params.status ?? ""}><option value="">All statuses</option><option value="paid">Paid</option><option value="partially_paid">Partially paid</option><option value="unpaid">Unpaid</option><option value="overdue">Overdue</option></select><button className="btn btn-secondary btn-sm">Apply</button></div></form><div className="table-wrap"><table className="data-table"><thead><tr><th>Invoice</th><th>Member</th><th>Due date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th /></tr></thead><tbody>{invoiceRows.map(row => { const actual = row.balance > 0 && row.dueAt < new Date() ? "overdue" : row.status; return <tr key={row.id}><td><Link className="link mono" href={`/payments/invoices/${row.id}`}>{row.invoiceNumber}</Link></td><td><Link href={`/members/${row.memberId}?tab=payments`}><strong>{row.firstName} {row.lastName}</strong><small className="table-sub">{row.memberNumber}</small></Link></td><td>{row.dueAt.toLocaleDateString("en-PK")}</td><td>{money.format(row.total)}</td><td>{money.format(row.paid)}</td><td><strong>{money.format(row.balance)}</strong></td><td><InvoiceBadge status={actual}/></td><td>{row.balance > 0 && <Link className="btn btn-secondary btn-sm" href={`/payments/invoices/${row.id}/pay`}>Record payment</Link>}</td></tr>; })}</tbody></table>{!invoiceRows.length && <div className="empty-inline">No invoices match these filters.</div>}</div></section>}</div>;
}
function FinanceStat({ icon: Icon, label, value }: {
    icon: typeof CreditCard;
    label: string;
    value: string;
}) { return <article className="card finance-stat"><span><Icon size={18}/></span><div><strong>{value}</strong><small>{label}</small></div></article>; }
function InvoiceBadge({ status }: {
    status: string;
}) { return <span className={`invoice-badge invoice-${status}`}>{status.replaceAll("_", " ")}</span>; }
