import Link from "next/link";
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, Search, SlidersHorizontal, UserRoundPlus, UsersRound } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { listMembers } from "@/lib/members";
import { MemberStatusBadge } from "@/components/member-status";
import { db } from "@/db";
import { trainers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
type Props = {
    searchParams: Promise<{
        q?: string;
        status?: string;
        sort?: string;
        page?: string;
    }>;
};
const fmt = (value: Date | null) => value ? new Intl.DateTimeFormat("en-PK", { day: "numeric", month: "short", year: "numeric" }).format(value) : "—";
export default async function MembersPage({ searchParams }: Props) {
    const user = await requirePermission("members.read");
    const params = await searchParams;
    const trainer = user.role === "trainer" ? (await (db.select({ id: trainers.id }).from(trainers)).where(and(eq(trainers.gymId, user.gymId), eq(trainers.userId, user.id))))[0] : null;
    const data = await listMembers(user.gymId, { ...params, page: Number(params.page) || 1, trainerId: user.role === "trainer" ? (trainer?.id ?? "__none__") : undefined });
    const link = (page: number) => `/members?${new URLSearchParams({ ...params, page: String(page) }).toString()}`;
    return <div className="content"><div className="page-head"><div><div className="eyebrow">Member directory</div><h1>Members</h1><p>{data.total} people in your gym workspace.</p></div><Link href="/members/new" className="btn btn-primary"><Plus size={16}/> Add member</Link></div>
  <section className="card table-card"><form className="table-toolbar"><div className="table-search"><Search size={17}/><input name="q" defaultValue={params.q ?? ""} placeholder="Search name, phone, email, or member ID"/><button className="sr-only">Search</button></div><div className="filter-group"><SlidersHorizontal size={15}/><select name="status" defaultValue={params.status ?? ""} aria-label="Filter by status"><option value="">All statuses</option><option value="active">Active</option><option value="expiring_soon">Expiring soon</option><option value="expired">Expired</option><option value="frozen">Frozen</option><option value="cancelled">Cancelled</option></select><select name="sort" defaultValue={params.sort ?? "newest"} aria-label="Sort members"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option><option value="expiry">Expiry date</option></select><button className="btn btn-secondary btn-sm">Apply</button></div></form>
  {data.rows.length ? <><div className="table-wrap"><table className="data-table"><thead><tr><th>Member</th><th>Member ID</th><th>Phone</th><th>Membership</th><th>Status</th><th>Expiry</th><th>Trainer</th><th aria-label="Actions"/></tr></thead><tbody>{data.rows.map(m => <tr key={m.id}><td><Link className="member-cell" href={`/members/${m.id}`}><span className="avatar">{m.firstName[0]}{m.lastName[0]}</span><span><strong>{m.firstName} {m.lastName}</strong><small>{m.email ?? "No email"}</small></span></Link></td><td className="mono">{m.memberNumber}</td><td>{m.phone ?? "—"}</td><td>{m.membership ?? "No membership"}</td><td><MemberStatusBadge status={m.status}/></td><td>{fmt(m.expiry)}</td><td>{m.trainerName ?? "Unassigned"}</td><td><Link href={`/members/${m.id}`} className="row-action" aria-label={`View ${m.firstName}`}><MoreHorizontal size={17}/></Link></td></tr>)}</tbody></table></div><div className="pagination"><span>Showing {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} of {data.total}</span><div><Link aria-disabled={data.page <= 1} className={`page-btn ${data.page <= 1 ? "disabled" : ""}`} href={link(Math.max(1, data.page - 1))}><ChevronLeft size={16}/></Link><span>Page {data.page} of {data.pages}</span><Link aria-disabled={data.page >= data.pages} className={`page-btn ${data.page >= data.pages ? "disabled" : ""}`} href={link(Math.min(data.pages, data.page + 1))}><ChevronRight size={16}/></Link></div></div></> : <div className="empty-state"><div className="placeholder-icon">{params.q || params.status ? <UsersRound size={23}/> : <UserRoundPlus size={23}/>}</div><h2>{params.q || params.status ? "No members found" : "No members yet"}</h2><p>{params.q || params.status ? "Try changing or clearing your search filters." : "Add your first member to start managing your gym."}</p>{params.q || params.status ? <Link className="btn btn-secondary" href="/members">Clear filters</Link> : <Link className="btn btn-primary" href="/members/new">Add member</Link>}</div>}</section></div>;
}
