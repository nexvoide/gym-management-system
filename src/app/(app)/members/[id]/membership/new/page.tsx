import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { gyms, members, membershipPlans } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { MembershipOperationForm } from "@/components/membership-operation-form";
import { createMembershipFor } from "@/app/(app)/memberships/actions";
export default async function Page({ params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const user = await requirePermission("memberships.write");
    const { id } = await params;
    const member = (await (db.select().from(members)).where(and(eq(members.id, id), eq(members.gymId, user.gymId), isNull(members.archivedAt))))[0];
    if (!member)
        notFound();
    const plans = await ((db.select({ id: membershipPlans.id, name: membershipPlans.name, durationDays: membershipPlans.durationDays, price: membershipPlans.price }).from(membershipPlans)).where(and(eq(membershipPlans.gymId, user.gymId), eq(membershipPlans.active, true), isNull(membershipPlans.archivedAt)))).orderBy(asc(membershipPlans.price));
    const gym = (await (db.select({ currency: gyms.currency }).from(gyms)).where(eq(gyms.id, user.gymId)))[0];
    return <div className="content content-narrow"><div className="page-head"><div><div className="eyebrow">{member.memberNumber}</div><h1>Create membership</h1><p>Start a membership for {member.firstName} {member.lastName}.</p></div></div><MembershipOperationForm action={createMembershipFor.bind(null, id)} memberId={id} plans={plans} currency={gym?.currency ?? "PKR"} renew={false}/></div>;
}
