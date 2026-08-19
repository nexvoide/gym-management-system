import { addDays, startOfMonth, subDays } from "date-fns";
import { and, count, desc, eq, gt, gte, isNull, lte, sql } from "drizzle-orm";
import { ArrowRight, CalendarClock, CircleDollarSign, ReceiptText, TrendingUp, UserPlus, UserRoundCheck, UsersRound, WalletCards } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { auditLogs, expenses, gyms, invoices, members, memberships, payments, trainers, users } from "@/db/schema";
import { attendanceTotals } from "@/lib/attendance";
import { requirePermission } from "@/lib/auth";
import { dailyMoneySeries, presetRange } from "@/lib/reports";
import { can } from "@/lib/permissions";
type Props = {
    searchParams: Promise<{
        period?: string;
    }>;
};
export default async function Dashboard({ searchParams }: Props) {
    const user = await requirePermission("dashboard.view");
    const { period } = await searchParams;
    const financialAccess = can(user.role, "reports.read");
    const gym = (await (db.select().from(gyms)).where(eq(gyms.id, user.gymId)))[0]!;
    const now = new Date();
    const monthStart = startOfMonth(now);
    const totalMembers = (await (db.select({ value: count() }).from(members)).where(and(eq(members.gymId, user.gymId), isNull(members.archivedAt))))[0]!.value;
    const activeMembers = (await (db.select({ value: count(sql `distinct ${memberships.memberId}`) }).from(memberships)).where(and(eq(memberships.gymId, user.gymId), eq(memberships.status, "active"), lte(memberships.startsAt, now), gte(memberships.endsAt, now))))[0]!.value;
    const newMembers = (await (db.select({ value: count() }).from(members)).where(and(eq(members.gymId, user.gymId), gte(members.createdAt, monthStart))))[0]!.value;
    const trainerId = user.role === "trainer" ? (await (db.select({ id: trainers.id }).from(trainers)).where(and(eq(trainers.gymId, user.gymId), eq(trainers.userId, user.id))))[0]?.id : undefined;
    const attendanceSummary = await attendanceTotals(user.gymId, gym.timezone, now, trainerId);
    const monthlyRevenue = (await (db.select({ value: sql<number> `coalesce(sum(${payments.amount}), 0)::double precision` }).from(payments)).where(and(eq(payments.gymId, user.gymId), gte(payments.paidAt, monthStart))))[0]!.value;
    const monthlyExpenses = (await (db.select({ value: sql<number> `coalesce(sum(${expenses.amount}), 0)::double precision` }).from(expenses)).where(and(eq(expenses.gymId, user.gymId), gte(expenses.expenseDate, monthStart))))[0]!.value;
    const outstanding = (await (db.select({ value: sql<number> `coalesce(sum(${invoices.balance}), 0)::double precision` }).from(invoices)).where(and(eq(invoices.gymId, user.gymId), gt(invoices.balance, 0))))[0]!.value;
    const expiring = (await (db.select({ value: count() }).from(memberships)).where(and(eq(memberships.gymId, user.gymId), eq(memberships.status, "active"), gte(memberships.endsAt, now), lte(memberships.endsAt, addDays(now, 7)))))[0]!.value;
    const recentlyExpired = (await (db.select({ value: count() }).from(memberships)).where(and(eq(memberships.gymId, user.gymId), gte(memberships.endsAt, subDays(now, 7)), lte(memberships.endsAt, now))))[0]!.value;
    const overdueInvoices = (await (db.select({ value: count() }).from(invoices)).where(and(eq(invoices.gymId, user.gymId), gt(invoices.balance, 0), lte(invoices.dueAt, now))))[0]!.value;
    const range = presetRange(period, now);
    const paymentRows = await (db.select({ date: payments.paidAt, amount: payments.amount }).from(payments)).where(and(eq(payments.gymId, user.gymId), gte(payments.paidAt, range.from), lte(payments.paidAt, range.to)));
    const series = dailyMoneySeries(paymentRows, range.from, range.to);
    const chart = series.length > 45 ? series.filter((_, index) => index % Math.ceil(series.length / 36) === 0 || index === series.length - 1) : series;
    const chartMax = Math.max(...chart.map(item => item.value), 1);
    const recent = await ((((db.select({ id: auditLogs.id, action: auditLogs.action, createdAt: auditLogs.createdAt, actor: users.name }).from(auditLogs)).leftJoin(users, eq(auditLogs.userId, users.id))).where(eq(auditLogs.gymId, user.gymId))).orderBy(desc(auditLogs.createdAt))).limit(6);
    const money = new Intl.NumberFormat(gym.locale, { style: "currency", currency: gym.currency, maximumFractionDigits: 0 });
    const number = new Intl.NumberFormat(gym.locale);
    const profit = monthlyRevenue - monthlyExpenses;
    if (!financialAccess)
        return <div className="content"><div className="page-head"><div><div className="eyebrow">{new Intl.DateTimeFormat(gym.locale, { weekday: "long", month: "long", day: "numeric", timeZone: gym.timezone }).format(now)}</div><h1>Good day, {user.name.split(" ")[0]}</h1><p>Here’s the operational picture for {gym.name} today.</p></div></div><section className="dashboard-kpis"><Kpi label="Total members" value={number.format(totalMembers)} foot={`+${newMembers} this month`} icon={UsersRound}/><Kpi label="Active members" value={number.format(activeMembers)} foot={`${totalMembers ? Math.round(activeMembers / totalMembers * 100) : 0}% of members`} icon={UserRoundCheck}/><Kpi label="Today's attendance" value={number.format(attendanceSummary.today)} foot={`${attendanceSummary.week} in the last 7 days`} icon={CalendarClock}/><Kpi label="Expiring soon" value={number.format(expiring)} foot="Within the next 7 days" icon={TrendingUp}/></section><section className="card section-card"><div className="section-head"><div><h3>Needs attention</h3><span>Member operations worth acting on</span></div></div><div className="attention"><Attention title={`${expiring} memberships`} subtitle="Expiring within 7 days" href="/members?status=expiring_soon" icon={CalendarClock}/><Attention title={`${recentlyExpired} memberships`} subtitle="Expired in the last 7 days" href="/members?status=expired" icon={UserRoundCheck}/></div></section></div>;
    return <div className="content">
    <div className="page-head"><div><div className="eyebrow">{new Intl.DateTimeFormat(gym.locale, { weekday: "long", month: "long", day: "numeric", timeZone: gym.timezone }).format(now)}</div><h1>Good day, {user.name.split(" ")[0]}</h1><p>Here’s the shape of {gym.name} today.</p></div><div className="quick-actions"><Link className="btn btn-secondary" href="/attendance">Check in</Link><Link className="btn btn-secondary" href="/payments">Record payment</Link><Link className="btn btn-primary" href="/members/new">Add member</Link></div></div>
    <section className="dashboard-kpis">
      <Kpi label="Total members" value={number.format(totalMembers)} foot={`+${newMembers} this month`} icon={UsersRound}/>
      <Kpi label="Active members" value={number.format(activeMembers)} foot={`${totalMembers ? Math.round(activeMembers / totalMembers * 100) : 0}% of members`} icon={UserRoundCheck}/>
      <Kpi label="Today's attendance" value={number.format(attendanceSummary.today)} foot={`${attendanceSummary.week} in the last 7 days`} icon={CalendarClock}/>
      {financialAccess && <Kpi label="Monthly revenue" value={money.format(monthlyRevenue)} foot={`${money.format(profit)} net profit`} icon={CircleDollarSign}/>}
      {financialAccess && <Kpi label="Outstanding" value={money.format(outstanding)} foot={`${overdueInvoices} overdue invoices`} icon={WalletCards}/>}
      <Kpi label="Expiring soon" value={number.format(expiring)} foot="Within the next 7 days" icon={TrendingUp}/>
    </section>
    <section className="dashboard-main-grid">
      <article className="card section-card revenue-card"><div className="section-head"><div><h3>Revenue</h3><span>Payments received during the selected period</span></div><div className="period-switch">{["7d", "30d", "3m", "6m", "12m"].map(item => <Link key={item} className={range.preset === item ? "active" : ""} href={`/dashboard?period=${item}`}>{item}</Link>)}</div></div><div className="chart" aria-label="Revenue chart">{chart.map(item => <div className="chart-column" key={item.date} title={`${item.date}: ${money.format(item.value)}`}><div className="bar" style={{ height: `${Math.max(item.value ? 7 : 2, item.value / chartMax * 100)}%` }}/></div>)}</div><div className="chart-axis"><span>{chart.at(0)?.date}</span><strong>{money.format(paymentRows.reduce((sum, row) => sum + row.amount, 0))} total</strong><span>{chart.at(-1)?.date}</span></div></article>
      <article className="card section-card"><div className="section-head"><div><h3>Needs attention</h3><span>Items worth acting on</span></div></div><div className="attention"><Attention title={`${expiring} memberships`} subtitle="Expiring within 7 days" href="/members?status=expiring_soon" icon={CalendarClock}/><Attention title={`${money.format(outstanding)} outstanding`} subtitle={`Across ${overdueInvoices} overdue invoices`} href="/payments?status=overdue" icon={WalletCards}/><Attention title={`${recentlyExpired} memberships`} subtitle="Expired in the last 7 days" href="/members?status=expired" icon={UserRoundCheck}/></div></article>
    </section>
    <section className="dashboard-lower-grid">
      <article className="card section-card"><div className="section-head"><div><h3>Monthly position</h3><span>Transparent cash view for this month</span></div><Link href="/reports?report=financial" className="link">Full report</Link></div><div className="profit-stack"><div><span>Revenue</span><strong>{money.format(monthlyRevenue)}</strong></div><div><span>Expenses</span><strong className="expense-value">− {money.format(monthlyExpenses)}</strong></div><div className="profit-total"><span>Net profit</span><strong>{money.format(profit)}</strong></div></div></article>
      <article className="card section-card"><div className="section-head"><div><h3>Recent activity</h3><span>Important operational events</span></div></div><div className="recent-activity">{recent.map(item => <div key={item.id}><span className="activity-icon">{activityIcon(item.action)}</span><div><strong>{activityLabel(item.action)}</strong><small>{item.actor ?? "System"} · {relativeTime(item.createdAt, now)}</small></div></div>)}</div></article>
    </section>
  </div>;
}
function Kpi({ label, value, foot, icon: Icon }: {
    label: string;
    value: string;
    foot: string;
    icon: typeof UsersRound;
}) { return <article className="card stat"><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={17}/></span></div><div className="stat-value">{value}</div><div className="stat-foot">{foot}</div></article>; }
function Attention({ title, subtitle, href, icon: Icon }: {
    title: string;
    subtitle: string;
    href: string;
    icon: typeof UsersRound;
}) { return <Link className="attention-row" href={href}><span className="attention-icon"><Icon size={17}/></span><div className="attention-copy"><strong>{title}</strong><span>{subtitle}</span></div><ArrowRight size={15} className="muted"/></Link>; }
function activityLabel(action: string) { return ({ "member.created": "New member registered", "payment.recorded": "Payment received", "attendance.checked_in": "Member checked in", "membership.renewed": "Membership renewed", "membership.created": "Membership activated", "expense.created": "Expense recorded" } as Record<string, string>)[action] ?? action.replaceAll(".", " "); }
function activityIcon(action: string) {
    if (action.startsWith("payment"))
        return <CircleDollarSign size={15}/>;
    if (action.startsWith("attendance"))
        return <CalendarClock size={15}/>;
    if (action.startsWith("expense"))
        return <ReceiptText size={15}/>;
    return <UserPlus size={15}/>;
}
function relativeTime(date: Date, now: Date) { const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000)); return minutes < 60 ? `${minutes || 1}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`; }
