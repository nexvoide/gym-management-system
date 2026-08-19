import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { trainers } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { MemberForm } from "@/components/member-form";
import { createMember } from "../actions";
export default async function NewMemberPage() { const user = await requirePermission("members.write"); const available = await ((db.select({ id: trainers.id, name: trainers.name }).from(trainers)).where(eq(trainers.gymId, user.gymId))).orderBy(asc(trainers.name)); return <div className="content content-narrow"><div className="page-head"><div><div className="eyebrow">Member registration</div><h1>Add a member</h1><p>Capture the essentials now. Everything else can be added later.</p></div></div><MemberForm action={createMember} trainers={available}/></div>; }
