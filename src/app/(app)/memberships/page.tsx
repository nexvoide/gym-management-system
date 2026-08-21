import Link from "next/link";
import { addDays } from "date-fns";
import { and, asc, between, count, desc, eq, gt, isNull } from "drizzle-orm";
import { CalendarClock, Layers3, Pencil, Plus, Snowflake, WalletCards } from "lucide-react";
import { db } from "@/db";
import { gyms, members, membershipPlans, memberships } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
export default async function MembershipsPage({ searchParams }: {
    searchParams: Promise<{
        tab?: string;
    }>;
}) {
    const user = await requirePermission("memberships.read");
    const { tab = "memberships" } = await searchParams;
    const gym = (await (db.select({ currency: gyms.currency, locale: gyms.locale, timezone: gyms.timezone }).from(gyms)).where(eq(gyms.id, user.gymId)))[0];
    const locale = gym?.locale ?? "en-US";
    const money = (amount: number, currency: string) => new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
    const date = (value: Date) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: gym?.timezone ?? "UTC" }).format(value);
    const plans = await ((db.select().from(membershipPlans)).where(and(eq(membershipPlans.gymId, user.gymId), isNull(membershipPlans.archivedAt)))).orderBy(desc(membershipPlans.active), asc(membershipPlans.price));
    const now = new Date(), soon = addDays(now, 7);
    const active = (await (db.select({ value: count() }).from(memberships)).where(and(eq(memberships.gymId, user.gymId), eq(memberships.status, "active"), gt(memberships.endsAt, now))))[0]?.value ?? 0;
    const expiring = (await (db.select({ value: count() }).from(memberships)).where(and(eq(memberships.gymId, user.gymId), eq(memberships.status, "active"), between(memberships.endsAt, now, soon))))[0]?.value ?? 0;
    const frozen = (await (db.select({ value: count() }).from(memberships)).where(and(eq(memberships.gymId, user.gymId), eq(memberships.status, "frozen"))))[0]?.value ?? 0;
    const rows = tab === "memberships" ? await (((((db.select({ id: memberships.id, memberId: members.id, firstName: members.firstName, lastName: members.lastName, memberNumber: members.memberNumber, plan: membershipPlans.name, status: memberships.status, startsAt: memberships.startsAt, endsAt: memberships.endsAt, finalPrice: memberships.finalPrice, currency: memberships.currency }).from(memberships)).innerJoin(members, eq(memberships.memberId, members.id))).innerJoin(membershipPlans, eq(memberships.planId, membershipPlans.id))).where(eq(memberships.gymId, user.gymId))).orderBy(desc(memberships.endsAt))).limit(50) : [];
    return <div className="content"><div className="page-head"><div><div className="eyebrow">Plans and member terms</div><h1>Memberships</h1><p>Simple offers, predictable renewals, complete history.</p></div>{tab === "plans" && <Link className="btn btn-primary" href="/memberships/plans/new"><Plus size={16}/> New plan</Link>}</div><section className="membership-stats"><MiniStat icon={WalletCards} label="Active" value={active}/><MiniStat icon={CalendarClock} label="Expiring in 7 days" value={expiring}/><MiniStat icon={Snowflake} label="Frozen" value={frozen}/><MiniStat icon={Layers3} label="Available plans" value={plans.filter(p => p.active).length}/></section><nav className="profile-tabs membership-tabs"><Link className={tab === "memberships" ? "active" : ""} href="/memberships?tab=memberships">Memberships</Link><Link className={tab === "plans" ? "active" : ""} href="/memberships?tab=plans">Plans</Link></nav>
    {tab === "plans" ? <div className="plan-grid">{plans.map(plan => <article className={`card plan-card ${!plan.active ? "plan-inactive" : ""}`} key={plan.id}><div className="plan-card-head"><div><span className={`status-badge ${plan.active ? "status-active" : "status-cancelled"}`}><span className="status-dot"/>{plan.active ? "Available" : "Inactive"}</span><h2>{plan.name}</h2></div><Link className="row-action" href={`/memberships/plans/${plan.id}/edit`}><Pencil size={15}/></Link></div><p>{plan.description ?? "A straightforward membership plan."}</p><div className="plan-price"><strong>{money(plan.price, plan.currency)}</strong><span>for {plan.duration} {plan.durationUnit}</span></div>{plan.accessDescription && <div className="plan-access">{plan.accessDescription}</div>}</article>)}</div> : <section className="card table-card"><div className="table-wrap"><table className="data-table"><thead><tr><th>Member</th><th>Plan</th><th>Status</th><th>Started</th><th>Expires</th><th>Value</th></tr></thead><tbody>{rows.map(row => { const actual = row.status === "active" && row.endsAt < now ? "expired" : row.status; return <tr key={row.id}><td><Link className="member-cell" href={`/members/${row.memberId}?tab=membership`}><span className="avatar">{row.firstName[0]}{row.lastName[0]}</span><span><strong>{row.firstName} {row.lastName}</strong><small>{row.memberNumber}</small></span></Link></td><td>{row.plan}</td><td><span className={`status-badge status-${actual}`}><span className="status-dot"/>{actual[0].toUpperCase() + actual.slice(1)}</span></td><td>{date(row.startsAt)}</td><td>{date(row.endsAt)}</td><td>{money(row.finalPrice, row.currency)}</td></tr>; })}</tbody></table></div></section>}</div>;
}
function MiniStat({ icon: Icon, label, value }: {
    icon: typeof WalletCards;
    label: string;
    value: number;
}) { return <article className="card membership-stat"><span><Icon size={17}/></span><div><strong>{value}</strong><small>{label}</small></div></article>; }
