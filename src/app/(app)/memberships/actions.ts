"use server";
import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import { and, count, desc, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, gyms, invoiceItems, invoices, members, membershipFreezes, membershipHistory, membershipPlans, memberships, payments } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { calculateCharges, freezeDays, invoiceStatus, moneyToMinor, renewalWindow } from "@/lib/membership";
import { localDateFor } from "@/lib/attendance";
export type ActionState = {
    error?: string;
    fields?: Record<string, string[]>;
};
const optional = z.string().trim().max(500).optional().transform(v => v || null);
const moneyInput = z.string().trim().regex(/^\d+(?:\.\d{1,3})?$/);
const planSchema = z.object({ name: z.string().trim().min(2).max(60), description: optional, duration: z.coerce.number().int().min(1).max(3650), durationUnit: z.enum(["days","weeks","months","years"]), price: moneyInput, signupFee: moneyInput.default("0"), recurring: z.preprocess(v => v === "on", z.boolean()), accessDescription: optional, notes: optional, active: z.preprocess(v => v === "on", z.boolean()) });
const membershipSchema = z.object({ planId: z.string().min(1), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), discountType: z.enum(["fixed","percentage"]), discountValue: moneyInput.default("0"), paymentAmount: moneyInput.default("0"), paymentMethod: z.string().min(1), notes: optional });
export async function createPlan(_: ActionState, data: FormData): Promise<ActionState> {
    const user = await requirePermission("memberships.write");
    const parsed = planSchema.safeParse(Object.fromEntries(data));
    if (!parsed.success)
        return { error: "Correct the highlighted plan details.", fields: parsed.error.flatten().fieldErrors };
    const gym = (await (db.select({ currency: gyms.currency }).from(gyms)).where(eq(gyms.id, user.gymId)))[0];
    if (!gym) return { error: "Gym billing settings could not be found." };
    try { moneyToMinor(parsed.data.price, gym.currency); moneyToMinor(parsed.data.signupFee, gym.currency); } catch (error) { return { error: error instanceof Error ? error.message : "Enter valid plan amounts." }; }
    const id = crypto.randomUUID();
    try {
        const durationDays = parsed.data.durationUnit === "days" ? parsed.data.duration : parsed.data.durationUnit === "weeks" ? parsed.data.duration * 7 : parsed.data.durationUnit === "months" ? parsed.data.duration * 30 : parsed.data.duration * 365;
        await db.transaction(async (tx) => { await tx.insert(membershipPlans).values({ id, gymId: user.gymId, ...parsed.data, price: Number(parsed.data.price), signupFee: Number(parsed.data.signupFee), currency: gym.currency, durationDays }); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "membership_plan.created", entityType: "membership_plan", entityId: id }); });
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
    if (plan.currency !== (await (db.select({ currency: gyms.currency }).from(gyms)).where(eq(gyms.id, user.gymId)))[0]?.currency) return { error: "This plan uses the gym's previous currency. Create a new plan for the current billing currency." };
    try { moneyToMinor(parsed.data.price, plan.currency); moneyToMinor(parsed.data.signupFee, plan.currency); } catch (error) { return { error: error instanceof Error ? error.message : "Enter valid plan amounts." }; }
    try {
        const durationDays = parsed.data.durationUnit === "days" ? parsed.data.duration : parsed.data.durationUnit === "weeks" ? parsed.data.duration * 7 : parsed.data.durationUnit === "months" ? parsed.data.duration * 30 : parsed.data.duration * 365;
        await db.transaction(async (tx) => { await (tx.update(membershipPlans).set({ ...parsed.data, price: Number(parsed.data.price), signupFee: Number(parsed.data.signupFee), durationDays, updatedAt: new Date() })).where(eq(membershipPlans.id, id)); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "membership_plan.updated", entityType: "membership_plan", entityId: id }); });
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
    const member = (await (db.select().from(members)).where(and(eq(members.id, memberId), eq(members.gymId, user.gymId), isNull(members.archivedAt))))[0];
    const plan = (await (db.select().from(membershipPlans)).where(and(eq(membershipPlans.id, parsed.data.planId), eq(membershipPlans.gymId, user.gymId), eq(membershipPlans.active, true), isNull(membershipPlans.archivedAt))))[0];
    if (!member || !plan)
        return { error: "Member or plan could not be found." };
    const previous = (await ((db.select().from(memberships)).where(and(eq(memberships.gymId, user.gymId), eq(memberships.memberId, memberId), ne(memberships.status, "cancelled")))).orderBy(desc(memberships.endsAt)))[0];
    if (!renew && previous && previous.endsAt > new Date())
        return { error: "This member already has a current membership. Use Renew instead." };
    const gym = (await (db.select().from(gyms)).where(eq(gyms.id, user.gymId)))[0];
    if (!gym || plan.currency !== gym.currency) return { error: "The selected plan does not use the gym's current billing currency." };
    let charges; try { charges = calculateCharges({ price: plan.price, signupFee: plan.signupFee, discountType: parsed.data.discountType, discountValue: parsed.data.discountValue, taxPercentage: gym.taxEnabled ? gym.taxPercentage : 0, currency: plan.currency }); moneyToMinor(parsed.data.paymentAmount, plan.currency); } catch (error) { return { error: error instanceof Error ? error.message : "Correct the billing amounts." }; }
    if (moneyToMinor(parsed.data.paymentAmount, plan.currency) > moneyToMinor(charges.total, plan.currency)) return { error: "Payment cannot be greater than the final membership price." };
    const requestedStart = new Date(`${parsed.data.startDate}T12:00:00.000Z`);
    const window = renewalWindow(requestedStart, plan.duration, plan.durationUnit, renew ? previous?.endsAt : null);
    const status = parsed.data.startDate > localDateFor(gym.timezone) ? "pending" as const : "active" as const;
    const paymentAmount = Number(parsed.data.paymentAmount);
    const membershipId = crypto.randomUUID(), invoiceId = crypto.randomUUID();
    await db.transaction(async (tx) => {
        const invoiceSequence = ((await (tx.select({ value: count() }).from(invoices)).where(eq(invoices.gymId, user.gymId)))[0]?.value ?? 0) + 1;
        const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoiceSequence).padStart(5, "0")}`;
        await tx.insert(memberships).values({ id: membershipId, gymId: user.gymId, memberId, planId: plan.id, status, startsAt: window.startsAt, endsAt: window.endsAt, currency: plan.currency, basePrice: plan.price, signupFee: plan.signupFee, discountType: parsed.data.discountType, discountValue: Number(parsed.data.discountValue), discount: charges.discount, taxName: gym.taxEnabled ? gym.taxName : null, taxRate: gym.taxEnabled ? gym.taxPercentage : 0, tax: charges.tax, finalPrice: charges.total, notes: parsed.data.notes, createdBy: user.id });
        await tx.insert(membershipHistory).values({ id: crypto.randomUUID(), gymId: user.gymId, memberId, membershipId, action: renew ? "renewed" : "created", toStatus: status, startsAt: window.startsAt, endsAt: window.endsAt, notes: parsed.data.notes, performedBy: user.id });
        await tx.insert(invoices).values({ id: invoiceId, gymId: user.gymId, memberId, membershipId, invoiceNumber, currency: plan.currency, memberName: `${member.firstName} ${member.lastName}`, memberNumberSnapshot: member.memberNumber, memberEmail: member.email, memberPhone: member.phone, gymName: gym.name, gymAddress: gym.address, gymEmail: gym.email, gymPhone: gym.phone, issuedAt: new Date(), dueAt: window.startsAt, subtotal: charges.subtotal, discount: charges.discount, taxName: gym.taxEnabled ? gym.taxName : null, taxRate: gym.taxEnabled ? gym.taxPercentage : 0, tax: charges.tax, total: charges.total, paid: paymentAmount, balance: charges.total - paymentAmount, status: invoiceStatus(charges.total, paymentAmount), notes: parsed.data.notes });
        await tx.insert(invoiceItems).values({ id: crypto.randomUUID(), invoiceId, description: `${plan.name} membership`, quantity: 1, unitPrice: plan.price, amount: plan.price });
        if (plan.signupFee > 0) await tx.insert(invoiceItems).values({ id: crypto.randomUUID(), invoiceId, description: "Signup fee", quantity: 1, unitPrice: plan.signupFee, amount: plan.signupFee });
        if (paymentAmount > 0)
            await tx.insert(payments).values({ id: crypto.randomUUID(), gymId: user.gymId, memberId, invoiceId, currency: plan.currency, amount: paymentAmount, method: parsed.data.paymentMethod, paidAt: new Date(), recordedBy: user.id });
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
