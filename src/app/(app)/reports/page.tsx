import { format } from "date-fns";
import { and, asc, count, eq, gt, gte, isNull, lte, sql } from "drizzle-orm";
import { CalendarCheck, CircleDollarSign, Download, TrendingUp, UserRoundCheck, UsersRound, WalletCards } from "lucide-react";
import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { db } from "@/db";
import { attendance, expenseCategories, expenses, gyms, invoices, members, membershipHistory, membershipPlans, memberships, payments } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { customRange, dailyMoneySeries } from "@/lib/reports";
const reportTypes = ["members", "attendance", "financial", "memberships"] as const;
type ReportType = typeof reportTypes[number];
type Props = {
    searchParams: Promise<{
        report?: string;
        from?: string;
        to?: string;
    }>;
};
export default async function ReportsPage({ searchParams }: Props) {
    const user = await requirePermission("reports.read");
    const params = await searchParams;
    const report: ReportType = reportTypes.includes(params.report as ReportType) ? params.report as ReportType : "members";
    const range = customRange(params.from, params.to);
    const gym = (await (db.select().from(gyms)).where(eq(gyms.id, user.gymId)))[0]!;
    const money = new Intl.NumberFormat(gym.locale, { style: "currency", currency: gym.currency, maximumFractionDigits: 0 });
    const query = new URLSearchParams({ report, from: format(range.from, "yyyy-MM-dd"), to: format(range.to, "yyyy-MM-dd") });
    return <div className="content reports-page">
    <div className="page-head"><div><div className="eyebrow">Operational intelligence</div><h1>Reports</h1><p>Useful answers from real gym data, without accounting complexity.</p></div><div className="quick-actions no-print"><a className="btn btn-secondary" href={`/reports/export?${query}`}><Download size={16}/> Export CSV</a><PrintButton label="Print report"/></div></div>
    <nav className="report-tabs no-print">{reportTypes.map(item => <Link key={item} className={report === item ? "active" : ""} href={`/reports?report=${item}&from=${query.get("from")}&to=${query.get("to")}`}>{item}</Link>)}</nav>
    <form className="card report-filter no-print"><input type="hidden" name="report" value={report}/><label>From<input className="input" type="date" name="from" defaultValue={query.get("from")!}/></label><label>To<input className="input" type="date" name="to" defaultValue={query.get("to")!}/></label><button className="btn btn-primary">Apply range</button><span>{format(range.from, "MMM d, yyyy")} – {format(range.to, "MMM d, yyyy")}</span></form>
    {report === "members" && <MemberReport gymId={user.gymId} from={range.from} to={range.to}/>}
    {report === "attendance" && <AttendanceReport gymId={user.gymId} from={range.from} to={range.to}/>}
    {report === "financial" && <FinancialReport gymId={user.gymId} from={range.from} to={range.to} money={money}/>}
    {report === "memberships" && <MembershipReport gymId={user.gymId} from={range.from} to={range.to}/>}
  </div>;
}
async function MemberReport({ gymId, from, to }: {
    gymId: string;
    from: Date;
    to: Date;
}) {
    const now = new Date();
    const total = (await (db.select({ value: count() }).from(members)).where(and(eq(members.gymId, gymId), isNull(members.archivedAt))))[0]!.value;
    const joined = (await (db.select({ value: count() }).from(members)).where(and(eq(members.gymId, gymId), gte(members.createdAt, from), lte(members.createdAt, to))))[0]!.value;
    const active = (await (db.select({ value: count(sql `distinct ${memberships.memberId}`) }).from(memberships)).where(and(eq(memberships.gymId, gymId), eq(memberships.status, "active"), lte(memberships.startsAt, now), gte(memberships.endsAt, now))))[0]!.value;
    const expired = (await (db.select({ value: count(sql `distinct ${memberships.memberId}`) }).from(memberships)).where(and(eq(memberships.gymId, gymId), lte(memberships.endsAt, now))))[0]!.value;
    const growth = await (((db.select({ day: sql<string> `to_char(${members.createdAt}, 'YYYY-MM-DD')`, value: count() }).from(members)).where(and(eq(members.gymId, gymId), gte(members.createdAt, from), lte(members.createdAt, to)))).groupBy(sql `to_char(${members.createdAt}, 'YYYY-MM-DD')`)).orderBy(sql `to_char(${members.createdAt}, 'YYYY-MM-DD')`);
    return <div className="report-content"><ReportStats items={[["Total members", total, UsersRound], ["Active members", active, UserRoundCheck], ["Expired members", expired, WalletCards], ["New in range", joined, TrendingUp]]}/><article className="card report-chart-card"><ReportHeading title="Membership growth" subtitle="New member registrations in this range"/><MiniSeries rows={growth} empty="No members joined during this range."/></article></div>;
}
async function AttendanceReport({ gymId, from, to }: {
    gymId: string;
    from: Date;
    to: Date;
}) {
    const fromDay = format(from, "yyyy-MM-dd"), toDay = format(to, "yyyy-MM-dd");
    const days = await (((db.select({ day: attendance.localDate, visits: count(), uniqueMembers: count(sql `distinct ${attendance.memberId}`) }).from(attendance)).where(and(eq(attendance.gymId, gymId), gte(attendance.localDate, fromDay), lte(attendance.localDate, toDay)))).groupBy(attendance.localDate)).orderBy(asc(attendance.localDate));
    const total = days.reduce((sum, row) => sum + row.visits, 0);
    const average = days.length ? Math.round(total / days.length) : 0;
    const peak = days.reduce((best, row) => row.visits > (best?.visits ?? 0) ? row : best, undefined as typeof days[number] | undefined);
    return <div className="report-content"><ReportStats items={[["Total check-ins", total, CalendarCheck], ["Active days", days.length, TrendingUp], ["Daily average", average, UsersRound], ["Peak day", peak?.visits ?? 0, UserRoundCheck]]}/><article className="card report-chart-card"><ReportHeading title="Daily attendance" subtitle={peak ? `Peak: ${peak.day} with ${peak.visits} visits` : "No attendance recorded"}/><MiniSeries rows={days.map(row => ({ day: row.day, value: row.visits }))} empty="No attendance during this range."/></article><ReportTable headers={["Date", "Check-ins", "Unique members"]} rows={days.map(row => [row.day, row.visits, row.uniqueMembers])}/></div>;
}
async function FinancialReport({ gymId, from, to, money }: {
    gymId: string;
    from: Date;
    to: Date;
    money: Intl.NumberFormat;
}) {
    const revenueRows = await (db.select({ date: payments.paidAt, amount: payments.amount }).from(payments)).where(and(eq(payments.gymId, gymId), gte(payments.paidAt, from), lte(payments.paidAt, to)));
    const expenseRows = await (db.select({ date: expenses.expenseDate, amount: expenses.amount }).from(expenses)).where(and(eq(expenses.gymId, gymId), gte(expenses.expenseDate, from), lte(expenses.expenseDate, to)));
    const revenue = revenueRows.reduce((sum, row) => sum + row.amount, 0), costs = expenseRows.reduce((sum, row) => sum + row.amount, 0), profit = revenue - costs;
    const outstanding = (await (db.select({ value: sql<number> `coalesce(sum(${invoices.balance}), 0)::double precision` }).from(invoices)).where(and(eq(invoices.gymId, gymId), gt(invoices.balance, 0))))[0]!.value;
    const categories = await ((((db.select({ name: expenseCategories.name, total: sql<number> `coalesce(sum(${expenses.amount}), 0)::double precision` }).from(expenses)).innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))).where(and(eq(expenses.gymId, gymId), gte(expenses.expenseDate, from), lte(expenses.expenseDate, to)))).groupBy(expenseCategories.id)).orderBy(sql `sum(${expenses.amount}) desc`);
    const revenueSeries = dailyMoneySeries(revenueRows, from, to), expenseSeries = dailyMoneySeries(expenseRows, from, to);
    return <div className="report-content"><ReportStats items={[["Revenue", money.format(revenue), CircleDollarSign], ["Expenses", money.format(costs), WalletCards], ["Net profit", money.format(profit), TrendingUp], ["Outstanding", money.format(outstanding), UserRoundCheck]]}/><div className="report-two-column"><article className="card report-chart-card"><ReportHeading title="Cash movement" subtitle="Revenue and expenses by day"/><div className="finance-series">{revenueSeries.map((row, index) => { const max = Math.max(...revenueSeries.map(item => item.value), ...expenseSeries.map(item => item.value), 1); return <div key={row.date} title={`${row.date}: ${money.format(row.value)} revenue, ${money.format(expenseSeries[index]?.value ?? 0)} expenses`}><span style={{ height: `${row.value / max * 100}%` }}/><i style={{ height: `${(expenseSeries[index]?.value ?? 0) / max * 100}%` }}/></div>; })}</div><div className="chart-legend"><span><i className="legend-revenue"/>Revenue</span><span><i className="legend-expense"/>Expenses</span></div></article><article className="card report-chart-card"><ReportHeading title="Expense breakdown" subtitle="Cost categories during this range"/><div className="breakdown-list">{categories.map(row => <div key={row.name}><span>{row.name}</span><strong>{money.format(row.total)}</strong></div>)}</div></article></div></div>;
}
async function MembershipReport({ gymId, from, to }: {
    gymId: string;
    from: Date;
    to: Date;
}) {
    const now = new Date();
    const active = (await (db.select({ value: count() }).from(memberships)).where(and(eq(memberships.gymId, gymId), eq(memberships.status, "active"), gte(memberships.endsAt, now))))[0]!.value;
    const expiring = (await (db.select({ value: count() }).from(memberships)).where(and(eq(memberships.gymId, gymId), eq(memberships.status, "active"), gte(memberships.endsAt, now), lte(memberships.endsAt, new Date(now.getTime() + 7 * 86400000)))))[0]!.value;
    const expired = (await (db.select({ value: count() }).from(memberships)).where(and(eq(memberships.gymId, gymId), lte(memberships.endsAt, now))))[0]!.value;
    const renewals = (await (db.select({ value: count() }).from(membershipHistory)).where(and(eq(membershipHistory.gymId, gymId), eq(membershipHistory.action, "renewed"), gte(membershipHistory.createdAt, from), lte(membershipHistory.createdAt, to))))[0]!.value;
    const plans = await ((((db.select({ plan: membershipPlans.name, members: count(), value: sql<number> `coalesce(sum(${memberships.finalPrice}), 0)::double precision` }).from(memberships)).innerJoin(membershipPlans, eq(memberships.planId, membershipPlans.id))).where(and(eq(memberships.gymId, gymId), gte(memberships.createdAt, from), lte(memberships.createdAt, to)))).groupBy(membershipPlans.id)).orderBy(sql `count(*) desc`);
    return <div className="report-content"><ReportStats items={[["Active", active, UserRoundCheck], ["Expiring soon", expiring, TrendingUp], ["Expired", expired, WalletCards], ["Renewals in range", renewals, CalendarCheck]]}/><ReportTable headers={["Membership plan", "Started / renewed", "Contract value"]} rows={plans.map(row => [row.plan, row.members, row.value.toLocaleString()])}/></div>;
}
type StatItem = [
    string,
    string | number,
    typeof UsersRound
];
function ReportStats({ items }: {
    items: StatItem[];
}) { return <section className="report-stats">{items.map(([label, value, Icon]) => <article className="card report-stat" key={label}><span><Icon size={18}/></span><div><strong>{value}</strong><small>{label}</small></div></article>)}</section>; }
function ReportHeading({ title, subtitle }: {
    title: string;
    subtitle: string;
}) { return <div className="section-head"><div><h3>{title}</h3><span>{subtitle}</span></div></div>; }
function MiniSeries({ rows, empty }: {
    rows: {
        day: string;
        value: number;
    }[];
    empty: string;
}) {
    if (!rows.length)
        return <div className="empty-inline">{empty}</div>;
    const max = Math.max(...rows.map(row => row.value), 1);
    return <div className="mini-series">{rows.map(row => <div key={row.day} title={`${row.day}: ${row.value}`}><span style={{ height: `${Math.max(4, row.value / max * 100)}%` }}/><small>{row.day.slice(5)}</small></div>)}</div>;
}
function ReportTable({ headers, rows }: {
    headers: string[];
    rows: (string | number)[][];
}) { return <article className="card table-card"><div className="table-wrap"><table className="data-table"><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>{!rows.length && <div className="empty-inline">No records during this range.</div>}</div></article>; }
