import { format } from "date-fns";
import { and, count, desc, eq, gte, like, lte, or, type SQL } from "drizzle-orm";
import { ChevronLeft, ChevronRight, Filter, ScrollText } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { auditLogs, expenseCategories, expenses, invoices, members, membershipPlans, trainers, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { customRange } from "@/lib/reports";
type Props = {
    searchParams: Promise<{
        q?: string;
        action?: string;
        from?: string;
        to?: string;
        page?: string;
    }>;
};
const pageSize = 30;
export default async function AuditPage({ searchParams }: Props) {
    const user = await requirePermission("audit.read");
    const params = await searchParams;
    const range = customRange(params.from, params.to, new Date());
    const page = Math.max(1, Number(params.page) || 1);
    const filters: SQL[] = [eq(auditLogs.gymId, user.gymId), gte(auditLogs.createdAt, range.from), lte(auditLogs.createdAt, range.to)];
    if (params.action)
        filters.push(like(auditLogs.action, `${params.action}%`));
    if (params.q)
        filters.push(or(like(auditLogs.action, `%${params.q}%`), like(auditLogs.entityId, `%${params.q}%`), like(users.name, `%${params.q}%`))!);
    const where = and(...filters);
    const total = (await ((db.select({ value: count() }).from(auditLogs)).leftJoin(users, eq(auditLogs.userId, users.id))).where(where))[0]!.value;
    const rows = await (((((db.select({ id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt, actor: users.name, actorEmail: users.email }).from(auditLogs)).leftJoin(users, eq(auditLogs.userId, users.id))).where(where)).orderBy(desc(auditLogs.createdAt))).limit(pageSize)).offset((page - 1) * pageSize);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const entityMaps = await buildEntityMaps(user.gymId);
    const href = (next: number) => `/audit?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), ...(params.action ? { action: params.action } : {}), from: format(range.from, "yyyy-MM-dd"), to: format(range.to, "yyyy-MM-dd"), page: String(next) })}`;
    return <div className="content audit-page">
    <div className="page-head"><div><div className="eyebrow">Accountability</div><h1>Audit log</h1><p>Important operational and administrative actions across the gym.</p></div><span className="audit-count"><ScrollText size={16}/> {total} events</span></div>
    <form className="card audit-filter"><div className="table-search"><input name="q" defaultValue={params.q ?? ""} placeholder="Search action, user, or record ID"/></div><div className="filter-group"><Filter size={15}/><select name="action" defaultValue={params.action ?? ""}><option value="">All actions</option><option value="member.">Members</option><option value="membership.">Memberships</option><option value="payment.">Payments</option><option value="expense.">Expenses</option><option value="trainer.">Trainers</option><option value="settings.">Settings</option><option value="user.">Users</option></select><input className="history-date" type="date" name="from" defaultValue={format(range.from, "yyyy-MM-dd")}/><input className="history-date" type="date" name="to" defaultValue={format(range.to, "yyyy-MM-dd")}/><button className="btn btn-secondary btn-sm">Apply</button></div></form>
    <section className="card audit-list">{rows.map(row => { const target = entityTarget(row.entityType, row.entityId, entityMaps); return <article key={row.id}><span className="audit-marker"/><div className="audit-event"><strong>{actionLabel(row.action)}</strong><span>{target.href ? <Link className="link" href={target.href}>{target.label}</Link> : target.label}</span>{metadataSummary(row.metadata) && <small>{metadataSummary(row.metadata)}</small>}</div><div className="audit-actor"><strong>{row.actor ?? "System"}</strong><span>{row.actorEmail ?? "Automated event"}</span></div><time dateTime={row.createdAt.toISOString()}>{format(row.createdAt, "MMM d, yyyy")}<span>{format(row.createdAt, "h:mm a")}</span></time></article>; })}{!rows.length && <div className="empty-state"><span className="placeholder-icon"><ScrollText size={22}/></span><h2>No audit events found</h2><p>Try a wider date range or clear the filters.</p></div>}</section>
    <div className="pagination"><span>Showing {(page - 1) * pageSize + (rows.length ? 1 : 0)}–{(page - 1) * pageSize + rows.length} of {total}</span><div><Link className={`page-btn ${page <= 1 ? "disabled" : ""}`} href={href(page - 1)}><ChevronLeft size={15}/></Link><span>Page {page} of {pages}</span><Link className={`page-btn ${page >= pages ? "disabled" : ""}`} href={href(page + 1)}><ChevronRight size={15}/></Link></div></div>
  </div>;
}
async function buildEntityMaps(gymId: string) {
    return {
        members: new Map((await db.select({ id: members.id, number: members.memberNumber, first: members.firstName, last: members.lastName }).from(members).where(eq(members.gymId, gymId))).map(row => [row.id, { label: `${row.first} ${row.last} (${row.number})`, href: `/members/${row.id}` }])),
        invoices: new Map((await db.select({ id: invoices.id, number: invoices.invoiceNumber }).from(invoices).where(eq(invoices.gymId, gymId))).map(row => [row.id, { label: row.number, href: `/payments/invoices/${row.id}` }])),
        trainers: new Map((await db.select({ id: trainers.id, name: trainers.name }).from(trainers).where(eq(trainers.gymId, gymId))).map(row => [row.id, { label: row.name, href: `/trainers/${row.id}` }])),
        expenses: new Map((await db.select({ id: expenses.id, name: expenses.description }).from(expenses).where(eq(expenses.gymId, gymId))).map(row => [row.id, { label: row.name, href: `/expenses/${row.id}/edit` }])),
        plans: new Map((await db.select({ id: membershipPlans.id, name: membershipPlans.name }).from(membershipPlans).where(eq(membershipPlans.gymId, gymId))).map(row => [row.id, { label: row.name, href: `/memberships/plans/${row.id}/edit` }])),
        categories: new Map((await db.select({ id: expenseCategories.id, name: expenseCategories.name }).from(expenseCategories).where(eq(expenseCategories.gymId, gymId))).map(row => [row.id, { label: row.name, href: "/expenses?tab=categories" }])),
    };
}
type EntityMaps = Awaited<ReturnType<typeof buildEntityMaps>>;
function entityTarget(type: string, id: string | null, maps: EntityMaps) {
    if (!id)
        return { label: type, href: null };
    if (type === "member")
        return maps.members.get(id) ?? { label: id, href: `/members/${id}` };
    if (type === "invoice")
        return maps.invoices.get(id) ?? { label: id, href: `/payments/invoices/${id}` };
    if (type === "trainer")
        return maps.trainers.get(id) ?? { label: id, href: `/trainers/${id}` };
    if (type === "expense")
        return maps.expenses.get(id) ?? { label: id, href: `/expenses/${id}/edit` };
    if (type === "membership_plan")
        return maps.plans.get(id) ?? { label: id, href: null };
    if (type === "expense_category")
        return maps.categories.get(id) ?? { label: id, href: null };
    if (type === "gym")
        return { label: "Gym settings", href: "/settings" };
    return { label: id, href: null };
}
function actionLabel(action: string) { return action.split(".").map(word => word[0].toUpperCase() + word.slice(1)).join(" "); }
function metadataSummary(metadata: unknown) {
    if (!metadata || typeof metadata !== "object")
        return "";
    return Object.entries(metadata as Record<string, unknown>).slice(0, 3).map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`).join(" · ");
}
