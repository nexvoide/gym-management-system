import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { trainers } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { getMember } from "@/lib/members";
import { MemberForm } from "@/components/member-form";
import { updateMember } from "../../actions";
export default async function EditMemberPage({ params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const user = await requirePermission("members.write");
    const { id } = await params;
    const member = await getMember(user.gymId, id);
    if (!member)
        notFound();
    const available = await ((db.select({ id: trainers.id, name: trainers.name }).from(trainers)).where(eq(trainers.gymId, user.gymId))).orderBy(asc(trainers.name));
    const action = updateMember.bind(null, id);
    return <div className="content content-narrow"><div className="page-head"><div><div className="eyebrow">{member.memberNumber}</div><h1>Edit member</h1><p>Update {member.firstName}’s profile and internal details.</p></div></div><MemberForm action={action} values={member} trainers={available}/></div>;
}
