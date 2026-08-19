import Link from "next/link";
import { and, desc, eq, isNotNull, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { CalendarCheck, Clock3, Search, UserRoundCheck, UsersRound } from "lucide-react";
import { db } from "@/db";
import { attendance, gyms, members, trainers, users } from "@/db/schema";
import { attendanceCandidate, attendanceTotals } from "@/lib/attendance";
import { requirePermission } from "@/lib/auth";
import { listMembers, type MemberStatus } from "@/lib/members";
import { can } from "@/lib/permissions";
import { AttendanceMemberCard } from "@/components/attendance-member-card";
type Props = {
    searchParams: Promise<{
        tab?: string;
        q?: string;
        member?: string;
        date?: string;
        status?: string;
    }>;
};
export default async function AttendancePage({ searchParams }: Props) {
    const user = await requirePermission("attendance.read");
    const params = await searchParams, tab = params.tab ?? "reception";
    const trainer = user.role === "trainer" ? (await (db.select({ id: trainers.id }).from(trainers)).where(and(eq(trainers.gymId, user.gymId), eq(trainers.userId, user.id))))[0] : null;
    const trainerId = user.role === "trainer" ? (trainer?.id ?? "__none__") : undefined;
    const gym = (await (db.select({ timezone: gyms.timezone }).from(gyms)).where(eq(gyms.id, user.gymId)))[0];
    const totals = await attendanceTotals(user.gymId, gym?.timezone ?? "UTC", new Date(), trainerId);
    let candidates: Awaited<ReturnType<typeof attendanceCandidate>>[] = [];
    if (params.member) {
        const listed = await listMembers(user.gymId, { page: 1, trainerId });
        candidates = await Promise.all(listed.rows.filter(row => row.id === params.member).map(row => attendanceCandidate(user.gymId, row.id)));
    }
    else if (params.q?.trim().length) {
        const found = await listMembers(user.gymId, { q: params.q, page: 1, trainerId });
        candidates = await Promise.all(found.rows.slice(0, 6).map(row => attendanceCandidate(user.gymId, row.id)));
    }
    const usable = candidates.filter((item): item is NonNullable<typeof item> => Boolean(item));
    const filters: SQL[] = [eq(attendance.gymId, user.gymId)];
    if (trainerId)
        filters.push(eq(members.trainerId, trainerId));
    if (params.date)
        filters.push(eq(attendance.localDate, params.date));
    if (params.status === "inside")
        filters.push(isNull(attendance.checkOutAt));
    if (params.status === "complete")
        filters.push(isNotNull(attendance.checkOutAt));
    if (params.q && tab === "history") {
        const term = `%${params.q}%`;
        filters.push(or(like(members.firstName, term), like(members.lastName, term), like(sql `${members.firstName} || ' ' || ${members.lastName}`, term), like(members.memberNumber, term))!);
    }
    const history = tab === "history" ? await (((((db.select({ id: attendance.id, memberId: members.id, firstName: members.firstName, lastName: members.lastName, memberNumber: members.memberNumber, checkInAt: attendance.checkInAt, checkOutAt: attendance.checkOutAt, method: attendance.method, overrideUsed: attendance.overrideUsed, staffName: users.name }).from(attendance)).innerJoin(members, eq(attendance.memberId, members.id))).innerJoin(users, eq(attendance.staffUserId, users.id))).where(and(...filters))).orderBy(desc(attendance.checkInAt))).limit(100) : [];
    const method = params.q?.trim().toUpperCase().startsWith("FM-") ? "member_id" : "manual_search";
    return <div className="content"><div className="page-head"><div><div className="eyebrow">Reception desk</div><h1>Attendance</h1><p>Find a member and complete entry in seconds.</p></div></div><section className="attendance-stats"><Stat icon={CalendarCheck} label="Today" value={totals.today}/><Stat icon={UsersRound} label="Last 7 days" value={totals.week}/><Stat icon={UserRoundCheck} label="This month" value={totals.month}/><Stat icon={Clock3} label="Currently inside" value={totals.inside}/></section><nav className="profile-tabs membership-tabs"><Link className={tab === "reception" ? "active" : ""} href="/attendance">Reception</Link><Link className={tab === "history" ? "active" : ""} href="/attendance?tab=history">History</Link></nav>{tab === "reception" ? <><form className="reception-search"><Search size={23}/><input name="q" defaultValue={params.q ?? ""} placeholder="Search member by name, phone, or member ID" autoFocus/><button className="btn btn-primary">Find member</button></form><div className="reception-results">{usable.map(candidate => <AttendanceMemberCard key={candidate.member.id} candidate={candidate} status={(candidate.valid ? "active" : candidate.membership?.status === "frozen" ? "frozen" : "expired") as MemberStatus} canOverride={can(user.role, "attendance.override")} method={method}/>)}</div>{(params.q || params.member) && usable.length === 0 && <div className="card empty-state"><div className="placeholder-icon"><UsersRound size={22}/></div><h2>Member not found</h2><p>Check the name, phone number, or member ID and try again.</p></div>}{!params.q && !params.member && <div className="reception-prompt"><span>Tip</span> Member IDs provide the quickest exact match at reception.</div>}</> : <section className="card table-card"><form className="table-toolbar"><div className="table-search"><Search size={17}/><input name="q" defaultValue={params.q ?? ""} placeholder="Search attendance by member"/><input type="hidden" name="tab" value="history"/></div><div className="filter-group"><input className="history-date" type="date" name="date" defaultValue={params.date ?? ""}/><select name="status" defaultValue={params.status ?? ""}><option value="">All visits</option><option value="inside">Currently inside</option><option value="complete">Checked out</option></select><button className="btn btn-secondary btn-sm">Apply</button></div></form><div className="table-wrap"><table className="data-table"><thead><tr><th>Member</th><th>Check in</th><th>Check out</th><th>Duration</th><th>Method</th><th>Recorded by</th></tr></thead><tbody>{history.map(row => <tr key={row.id}><td><Link className="member-cell" href={`/members/${row.memberId}?tab=attendance`}><span className="avatar">{row.firstName[0]}{row.lastName[0]}</span><span><strong>{row.firstName} {row.lastName}</strong><small>{row.memberNumber}</small></span></Link></td><td>{row.checkInAt.toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}</td><td>{row.checkOutAt?.toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit" }) ?? <span className="status-badge status-active">Inside</span>}</td><td>{row.checkOutAt ? `${Math.max(1, Math.round((row.checkOutAt.getTime() - row.checkInAt.getTime()) / 60000))} min` : "—"}</td><td>{row.overrideUsed ? "Override" : row.method.replace("_", " ")}</td><td>{row.staffName}</td></tr>)}</tbody></table>{!history.length && <div className="empty-inline">No attendance records match these filters.</div>}</div></section>}</div>;
}
function Stat({ icon: Icon, label, value }: {
    icon: typeof CalendarCheck;
    label: string;
    value: number;
}) { return <article className="card attendance-stat"><span><Icon size={18}/></span><div><strong>{value}</strong><small>{label}</small></div></article>; }
