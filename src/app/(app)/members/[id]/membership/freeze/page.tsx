import { and, desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { members, memberships } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { MembershipFreezeForm } from "@/components/membership-freeze-form";
import { freezeMembership } from "@/app/(app)/memberships/actions";
export default async function Page({ params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const user = await requirePermission("memberships.write");
    const { id } = await params;
    const member = (await (db.select().from(members)).where(and(eq(members.id, id), eq(members.gymId, user.gymId))))[0];
    if (!member)
        notFound();
    const current = (await ((db.select().from(memberships)).where(and(eq(memberships.gymId, user.gymId), eq(memberships.memberId, id), eq(memberships.status, "active")))).orderBy(desc(memberships.endsAt)))[0];
    if (!current)
        redirect(`/members/${id}?tab=membership`);
    return <div className="content content-narrow"><div className="page-head"><div><div className="eyebrow">{member.memberNumber}</div><h1>Freeze membership</h1><p>Pause access without taking time away from {member.firstName}.</p></div></div><MembershipFreezeForm action={freezeMembership.bind(null, id)} memberId={id} currentEnd={current.endsAt}/></div>;
}
