import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { membershipPlans } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { MembershipPlanForm } from "@/components/membership-plan-form";
import { updatePlan } from "../../../actions";
export default async function Page({ params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const user = await requirePermission("memberships.write");
    const { id } = await params;
    const plan = (await (db.select().from(membershipPlans)).where(and(eq(membershipPlans.id, id), eq(membershipPlans.gymId, user.gymId), isNull(membershipPlans.archivedAt))))[0];
    if (!plan)
        notFound();
    return <div className="content content-narrow"><div className="page-head"><div><div className="eyebrow">Membership plans</div><h1>Edit {plan.name}</h1><p>Existing memberships retain their original recorded price.</p></div></div><MembershipPlanForm action={updatePlan.bind(null, id)} values={plan}/></div>;
}
