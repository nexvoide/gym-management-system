"use server";
import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import { and, count, desc, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, invoiceItems, invoices, members, membershipFreezes, membershipHistory, membershipPlans, memberships, payments } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { finalPrice, freezeDays, invoiceStatus, renewalWindow } from "@/lib/membership";
export type ActionState = {
    error?: string;
    fields?: Record<string, string[]>;
};
const optional = z.string().trim().max(500).optional().transform(v => v || null);
const planSchema = z.object({ name: z.string().trim().min(2).max(60), description: optional, durationDays: z.coerce.number().int().min(1).max(3650), price: z.coerce.number().min(0).max(1000000000), accessDescription: optional, notes: optional, active: z.preprocess(v => v === "on", z.boolean()) });
const membershipSchema = z.object({ planId: z.string().min(1), startDate: z.string().min(1).transform(v => new Date(`${v}T00:00:00`)), discount: z.coerce.number().min(0).default(0), paymentAmount: z.coerce.number().min(0).default(0), paymentMethod: z.string().min(1), notes: optional });
export async function createPlan(_: ActionState, data: FormData): Promise<ActionState> {
    const user = await requirePermission("memberships.write");
    const parsed = planSchema.safeParse(Object.fromEntries(data));
    if (!parsed.success)
        return { error: "Correct the highlighted plan details.", fields: parsed.error.flatten().fieldErrors };
    const id = crypto.randomUUID();
    try {
        await db.transaction(async (tx) => { await tx.insert(membershipPlans).values({ id, gymId: user.gymId, ...parsed.data }); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "membership_plan.created", entityType: "membership_plan", entityId: id }); });
    }
    catch {
        return { error: "A plan with this name already exists." };
    }
    redirect("/memberships?tab=plans");
}
export async function updatePlan(id: string, _: ActionState, data: FormData): Promise<ActionState> {
    const user = await requirePermission("memberships.write");
    const parsed = planSchema.safeParse(Object.fromEntries(data));
    if (!parsed.success)
        return { error: "Correct the highlighted plan details.", fields: parsed.error.flatten().fieldErrors };
    const plan = (await (db.select().from(membershipPlans)).where(and(eq(membershipPlans.id, id), eq(membershipPlans.gymId, user.gymId), isNull(membershipPlans.archivedAt))))[0];
    if (!plan)
        return { error: "Plan not found." };
    try {
        await db.transaction(async (tx) => { await (tx.update(membershipPlans).set({ ...parsed.data, updatedAt: new Date() })).where(eq(membershipPlans.id, id)); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "membership_plan.updated", entityType: "membership_plan", entityId: id }); });
    }
    catch {
        return { error: "A plan with this name already exists." };
    }
    redirect("/memberships?tab=plans");
}
async function saveMembership(memberId: string, renew: boolean, _: ActionState, data: FormData): Promise<ActionState> {
    const user = await requirePermission("memberships.write");
    const parsed = membershipSchema.safeParse(Object.fromEntries(data));
    if (!parsed.success)
        return { error: "Correct the membership and payment details.", fields: parsed.error.flatten().fieldErrors };
    const member = (await (db.select({ id: members.id }).from(members)).where(and(eq(members.id, memberId), eq(members.gymId, user.gymId), isNull(members.archivedAt))))[0];
    const plan = (await (db.select().from(membershipPlans)).where(and(eq(membershipPlans.id, parsed.data.planId), eq(membershipPlans.gymId, user.gymId), eq(membershipPlans.active, true), isNull(membershipPlans.archivedAt))))[0];
    if (!member || !plan)
        return { error: "Member or plan could not be found." };
    const previous = (await ((db.select().from(memberships)).where(and(eq(memberships.gymId, user.gymId), eq(memberships.memberId, memberId), ne(memberships.status, "cancelled")))).orderBy(desc(memberships.endsAt)))[0];
    if (!renew && previous && previous.endsAt > new Date())
        return { error: "This member already has a current membership. Use Renew instead." };
    const price = finalPrice(plan.price, parsed.data.discount);
    if (parsed.data.paymentAmount > price)
        return { error: "Payment cannot be greater than the final membership price." };
    const window = renewalWindow(parsed.data.startDate, plan.durationDays, renew ? previous?.endsAt : null);
    const membershipId = crypto.randomUUID(), invoiceId = crypto.randomUUID();
    await db.transaction(async (tx) => {
        const invoiceSequence = ((await (tx.select({ value: count() }).from(invoices)).where(eq(invoices.gymId, user.gymId)))[0]?.value ?? 0) + 1;
        const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoiceSequence).padStart(5, "0")}`;
        await tx.insert(memberships).values({ id: membershipId, gymId: user.gymId, memberId, planId: plan.id, status: "active", startsAt: window.startsAt, endsAt: window.endsAt, basePrice: plan.price, discount: parsed.data.discount, finalPrice: price, notes: parsed.data.notes, createdBy: user.id });
        await tx.insert(membershipHistory).values({ id: crypto.randomUUID(), gymId: user.gymId, memberId, membershipId, action: renew ? "renewed" : "created", toStatus: "active", startsAt: window.startsAt, endsAt: window.endsAt, notes: parsed.data.notes, performedBy: user.id });
        await tx.insert(invoices).values({ id: invoiceId, gymId: user.gymId, memberId, membershipId, invoiceNumber, issuedAt: new Date(), dueAt: window.startsAt, subtotal: plan.price, discount: parsed.data.discount, total: price, paid: parsed.data.paymentAmount, balance: price - parsed.data.paymentAmount, status: invoiceStatus(price, parsed.data.paymentAmount), notes: parsed.data.notes });
        await tx.insert(invoiceItems).values({ id: crypto.randomUUID(), invoiceId, description: `${plan.name} membership`, quantity: 1, unitPrice: plan.price, amount: plan.price });
        if (parsed.data.paymentAmount > 0)
            await tx.insert(payments).values({ id: crypto.randomUUID(), gymId: user.gymId, memberId, invoiceId, amount: parsed.data.paymentAmount, method: parsed.data.paymentMethod, paidAt: new Date(), recordedBy: user.id });
        await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: renew ? "membership.renewed" : "membership.created", entityType: "member", entityId: memberId, metadata: { membershipId, invoiceId } });
    });
    redirect(`/members/${memberId}?tab=membership`);
}
export async function createMembershipFor(memberId: string, state: ActionState, data: FormData) { return await saveMembership(memberId, false, state, data); }
export async function renewMembershipFor(memberId: string, state: ActionState, data: FormData) { return await saveMembership(memberId, true, state, data); }
const freezeSchema = z.object({ startDate: z.string().min(1).transform(v => new Date(`${v}T00:00:00`)), endDate: z.string().min(1).transform(v => new Date(`${v}T00:00:00`)), reason: optional });
export async function freezeMembership(memberId: string, _: ActionState, data: FormData): Promise<ActionState> {
    const user = await requirePermission("memberships.write");
    const parsed = freezeSchema.safeParse(Object.fromEntries(data));
    if (!parsed.success)
        return { error: "Enter a valid freeze period." };
    if (parsed.data.endDate <= parsed.data.startDate)
        return { error: "Freeze end date must be after its start date." };
    const membership = (await ((db.select().from(memberships)).where(and(eq(memberships.gymId, user.gymId), eq(memberships.memberId, memberId), eq(memberships.status, "active")))).orderBy(desc(memberships.endsAt)))[0];
    if (!membership)
        return { error: "No active membership was found." };
    const days = freezeDays(parsed.data.startDate, parsed.data.endDate);
    const isActive = startOfDay(parsed.data.startDate) <= startOfDay(new Date());
    await db.transaction(async (tx) => { await tx.insert(membershipFreezes).values({ id: crypto.randomUUID(), gymId: user.gymId, membershipId: membership.id, startDate: parsed.data.startDate, endDate: parsed.data.endDate, days, reason: parsed.data.reason, status: isActive ? "active" : "scheduled", createdBy: user.id }); await (tx.update(memberships).set({ status: isActive ? "frozen" : "active", endsAt: addDays(membership.endsAt, days), updatedAt: new Date() })).where(eq(memberships.id, membership.id)); await tx.insert(membershipHistory).values({ id: crypto.randomUUID(), gymId: user.gymId, memberId, membershipId: membership.id, action: "frozen", fromStatus: "active", toStatus: isActive ? "frozen" : "active", endsAt: addDays(membership.endsAt, days), notes: parsed.data.reason, performedBy: user.id }); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "membership.frozen", entityType: "member", entityId: memberId, metadata: { days } }); });
    redirect(`/members/${memberId}?tab=membership`);
}
export async function resumeMembership(memberId: string) {
    const user = await requirePermission("memberships.write");
    const membership = (await ((db.select().from(memberships)).where(and(eq(memberships.gymId, user.gymId), eq(memberships.memberId, memberId), eq(memberships.status, "frozen")))).orderBy(desc(memberships.endsAt)))[0];
    if (!membership)
        throw new Error("No frozen membership found.");
    const freeze = (await ((db.select().from(membershipFreezes)).where(and(eq(membershipFreezes.membershipId, membership.id), eq(membershipFreezes.status, "active")))).orderBy(desc(membershipFreezes.startDate)))[0];
    if (!freeze)
        throw new Error("No active freeze found.");
    const actual = Math.max(1, differenceInCalendarDays(startOfDay(new Date()), startOfDay(freeze.startDate)));
    const adjusted = addDays(membership.endsAt, actual - freeze.days);
    await db.transaction(async (tx) => { await (tx.update(membershipFreezes).set({ status: "completed", resumedAt: new Date(), updatedAt: new Date() })).where(eq(membershipFreezes.id, freeze.id)); await (tx.update(memberships).set({ status: "active", endsAt: adjusted, updatedAt: new Date() })).where(eq(memberships.id, membership.id)); await tx.insert(membershipHistory).values({ id: crypto.randomUUID(), gymId: user.gymId, memberId, membershipId: membership.id, action: "resumed", fromStatus: "frozen", toStatus: "active", endsAt: adjusted, performedBy: user.id }); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "membership.resumed", entityType: "member", entityId: memberId }); });
    revalidatePath(`/members/${memberId}`);
}
export async function cancelMembership(memberId: string) {
    const user = await requirePermission("memberships.write");
    const membership = (await ((db.select().from(memberships)).where(and(eq(memberships.gymId, user.gymId), eq(memberships.memberId, memberId), ne(memberships.status, "cancelled")))).orderBy(desc(memberships.endsAt)))[0];
    if (!membership)
        throw new Error("No membership found.");
    await db.transaction(async (tx) => { await (tx.update(memberships).set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })).where(eq(memberships.id, membership.id)); await tx.insert(membershipHistory).values({ id: crypto.randomUUID(), gymId: user.gymId, memberId, membershipId: membership.id, action: "cancelled", fromStatus: membership.status, toStatus: "cancelled", performedBy: user.id }); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "membership.cancelled", entityType: "member", entityId: memberId }); });
    revalidatePath(`/members/${memberId}`);
}
