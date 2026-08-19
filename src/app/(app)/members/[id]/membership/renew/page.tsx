import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { gyms, members, membershipPlans, memberships } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { MembershipOperationForm } from "@/components/membership-operation-form";
import { renewMembershipFor } from "@/app/(app)/memberships/actions";
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
    const current = (await ((db.select().from(memberships)).where(and(eq(memberships.gymId, user.gymId), eq(memberships.memberId, id), ne(memberships.status, "cancelled")))).orderBy(desc(memberships.endsAt)))[0];
    const plans = await ((db.select({ id: membershipPlans.id, name: membershipPlans.name, durationDays: membershipPlans.durationDays, price: membershipPlans.price }).from(membershipPlans)).where(and(eq(membershipPlans.gymId, user.gymId), eq(membershipPlans.active, true), isNull(membershipPlans.archivedAt)))).orderBy(asc(membershipPlans.price));
    const gym = (await (db.select({ currency: gyms.currency }).from(gyms)).where(eq(gyms.id, user.gymId)))[0];
    return <div className="content content-narrow"><div className="page-head"><div><div className="eyebrow">{member.memberNumber}</div><h1>Renew membership</h1><p>Extend membership for {member.firstName} {member.lastName}.</p></div></div><MembershipOperationForm action={renewMembershipFor.bind(null, id)} memberId={id} plans={plans} currency={gym?.currency ?? "PKR"} renew currentEnd={current?.endsAt}/></div>;
}
