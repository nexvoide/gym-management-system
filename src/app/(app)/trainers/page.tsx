import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { Mail, Phone, Plus, UsersRound } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { members, trainers } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
export default async function Page() {
    const user = await requirePermission("trainers.read");
    const rows = await ((db.select({
        id: trainers.id,
        name: trainers.name,
        phone: trainers.phone,
        email: trainers.email,
        specialization: trainers.specialization,
        status: trainers.status,
        joiningDate: trainers.joiningDate,
        assigned: sql<number> `(select count(*) from members where trainer_id = ${sql.raw("trainers.id")} and archived_at is null)`,
    }).from(trainers)).where(and(eq(trainers.gymId, user.gymId), isNull(trainers.archivedAt), ...(user.role === "trainer" ? [eq(trainers.userId, user.id)] : [])))).orderBy(asc(trainers.name));
    const assigned = user.role === "trainer" ? (rows[0]?.assigned ?? 0) : (await (db.select({ value: count() }).from(members)).where(and(eq(members.gymId, user.gymId), isNull(members.archivedAt), sql `${members.trainerId} is not null`)))[0]?.value ?? 0;
    return <div className="content">
    <div className="page-head"><div><div className="eyebrow">Coaching team</div><h1>Trainers</h1><p>{rows.filter(row => row.status === "active").length} active trainers · {assigned} assigned members.</p></div>{can(user.role, "trainers.write") && <Link className="btn btn-primary" href="/trainers/new"><Plus size={16}/> Add trainer</Link>}</div>
    <div className="trainer-grid">{rows.map(row => <Link className="card trainer-card" href={`/trainers/${row.id}`} key={row.id}>
      <div className="trainer-card-top"><div className="profile-avatar">{row.name.split(" ").map(part => part[0]).slice(0, 2).join("")}</div><span className={`status-badge ${row.status === "active" ? "status-active" : "status-cancelled"}`}><span className="status-dot"/>{row.status}</span></div>
      <h2>{row.name}</h2><p>{row.specialization ?? "General fitness"}</p>
      <div className="trainer-contact"><span><Phone size={14}/>{row.phone ?? "No phone"}</span><span><Mail size={14}/>{row.email ?? "No email"}</span></div>
      <div className="trainer-members"><UsersRound size={16}/><strong>{row.assigned}</strong><span>assigned members</span></div>
    </Link>)}</div>
  </div>;
}
