import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CalendarDays, Mail, MapPin, Pencil, Phone, UsersRound } from "lucide-react";
import { db } from "@/db";
import { members, trainers } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
export default async function Page({ params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const user = await requirePermission("trainers.read");
    const { id } = await params;
    const trainer = (await (db.select().from(trainers)).where(and(eq(trainers.id, id), eq(trainers.gymId, user.gymId), isNull(trainers.archivedAt), ...(user.role === "trainer" ? [eq(trainers.userId, user.id)] : []))))[0];
    if (!trainer)
        notFound();
    const assigned = await ((db.select({ id: members.id, memberNumber: members.memberNumber, firstName: members.firstName, lastName: members.lastName, phone: members.phone, status: members.status }).from(members)).where(and(eq(members.gymId, user.gymId), eq(members.trainerId, id), isNull(members.archivedAt)))).orderBy(asc(members.firstName));
    return <div className="content"><section className="profile-hero card"><div className="profile-identity"><div className="profile-avatar">{trainer.name.split(" ").map(part => part[0]).slice(0, 2).join("")}</div><div><div className="profile-id">TRAINER</div><h1>{trainer.name}</h1><div className="profile-meta"><span className={`status-badge ${trainer.status === "active" ? "status-active" : "status-cancelled"}`}><span className="status-dot"/>{trainer.status}</span><span>{trainer.specialization ?? "General fitness"}</span></div></div></div>{can(user.role, "trainers.write") && <Link className="btn btn-primary" href={`/trainers/${id}/edit`}><Pencil size={16}/> Edit trainer</Link>}</section><div className="trainer-profile-grid"><section className="card detail-card"><div className="section-head"><h3>Trainer details</h3></div><Detail icon={Phone} label="Phone" value={trainer.phone}/><Detail icon={Mail} label="Email" value={trainer.email}/><Detail icon={CalendarDays} label="Joined" value={trainer.joiningDate?.toLocaleDateString("en-PK") ?? "Not provided"}/><Detail icon={MapPin} label="Specialization" value={trainer.specialization}/>{trainer.notes && <p className="trainer-notes">{trainer.notes}</p>}</section><section className="card assigned-members"><div className="section-head"><div><h3>Assigned members</h3><span>{assigned.length} members</span></div><UsersRound size={18}/></div>{assigned.length ? <div>{assigned.map(member => <Link href={`/members/${member.id}`} key={member.id}><span className="avatar">{member.firstName[0]}{member.lastName[0]}</span><div><strong>{member.firstName} {member.lastName}</strong><small>{member.memberNumber} · {member.phone ?? "No phone"}</small></div><span className={`status-badge ${member.status === "active" ? "status-active" : "status-cancelled"}`}>{member.status}</span></Link>)}</div> : <div className="empty-inline">No members are assigned to this trainer.</div>}</section></div></div>;
}
function Detail({ icon: Icon, label, value }: {
    icon: typeof Phone;
    label: string;
    value: string | null;
}) { return <div className="detail-row"><span><Icon size={16}/></span><div><small>{label}</small><strong>{value ?? "Not provided"}</strong></div></div>; }
