"use server";
import { and, count, eq, ilike, isNull, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditLogs, gyms, invoiceItems, invoices, members, membershipHistory, membershipPlans, memberships, trainers } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { memberPhotoError, removeMemberPhoto, uploadMemberPhoto } from "@/lib/member-photos";
import { memberInputFromForm } from "@/lib/member-validation";
import { logger } from "@/lib/logger";
import { addPlanDuration, calculateCharges } from "@/lib/membership";
export type MemberFormState = {
    error?: string;
    fields?: Record<string, string[]>;
};
async function validTrainer(gymId: string, trainerId: string | null | undefined) { return !trainerId || Boolean((await (db.select({ id: trainers.id }).from(trainers)).where(and(eq(trainers.id, trainerId), eq(trainers.gymId, gymId), isNull(trainers.archivedAt))))[0]); }
async function standardPlan(gymId: string) {
    let plan = (await (db.select().from(membershipPlans)).where(and(eq(membershipPlans.gymId, gymId), ilike(membershipPlans.name, "Standard"), isNull(membershipPlans.archivedAt))).limit(1))[0];
    if (!plan) {
        const gym = (await (db.select({ currency: gyms.currency }).from(gyms)).where(eq(gyms.id, gymId)))[0];
        await db.insert(membershipPlans).values({ id: crypto.randomUUID(), gymId, name: "Standard", description: "Default membership for new members", durationDays: 30, duration: 1, durationUnit: "months", currency: gym?.currency ?? "USD", price: 0, active: true }).onConflictDoNothing();
        plan = (await (db.select().from(membershipPlans)).where(and(eq(membershipPlans.gymId, gymId), ilike(membershipPlans.name, "Standard"), isNull(membershipPlans.archivedAt))).limit(1))[0];
    }
    return plan;
}
export async function createMember(_: MemberFormState, formData: FormData): Promise<MemberFormState> {
    const user = await requirePermission("members.write");
    const parsed = memberInputFromForm(formData);
    if (!parsed.success)
        return { error: "Please correct the highlighted information.", fields: parsed.error.flatten().fieldErrors };
    if (!await validTrainer(user.gymId, parsed.data.trainerId))
        return { error: "The selected trainer does not belong to this gym." };
    const identifiers = [parsed.data.email ? eq(members.email, parsed.data.email) : undefined, parsed.data.phone ? eq(members.phone, parsed.data.phone) : undefined].filter(Boolean) as ReturnType<typeof eq>[];
    if (identifiers.length && (await (db.select({ id: members.id }).from(members)).where(and(eq(members.gymId, user.gymId), isNull(members.archivedAt), or(...identifiers))))[0])
        return { error: "A member with this email or phone number already exists." };
    const id = crypto.randomUUID();
    const plan = await standardPlan(user.gymId);
    if (!plan) return { error: "The Standard membership is unavailable. Please try again." };
    let photoPath: string | null = null;
    try {
        photoPath = await uploadMemberPhoto(user.gymId, id, formData.get("photo"));
    } catch (error) {
        return { error: error instanceof Error && error.message === "INVALID_MEMBER_PHOTO" ? memberPhotoError : "Unable to upload photo. Please try again." };
    }
    try {
        await db.transaction(async (tx) => {
            const sequence = ((await (tx.select({ value: count() }).from(members)).where(eq(members.gymId, user.gymId)))[0]?.value ?? 0) + 1001;
            const memberNumber = `FM-${sequence}`, startsAt = new Date(), endsAt = addPlanDuration(startsAt, plan.duration, plan.durationUnit), membershipId = crypto.randomUUID();
            const gym = (await (tx.select().from(gyms)).where(eq(gyms.id, user.gymId)))[0]!;
            const charges = calculateCharges({ price: plan.price, signupFee: plan.signupFee, discountType: "fixed", discountValue: 0, taxPercentage: gym.taxEnabled ? gym.taxPercentage : 0, currency: plan.currency });
            await tx.insert(members).values({ id, gymId: user.gymId, memberNumber, ...parsed.data, profilePhotoUrl: photoPath });
            await tx.insert(memberships).values({ id: membershipId, gymId: user.gymId, memberId: id, planId: plan.id, status: "active", startsAt, endsAt, currency: plan.currency, basePrice: plan.price, signupFee: plan.signupFee, discountType: "fixed", discountValue: 0, discount: 0, taxName: gym.taxEnabled ? gym.taxName : null, taxRate: gym.taxEnabled ? gym.taxPercentage : 0, tax: charges.tax, finalPrice: charges.total, createdBy: user.id });
            await tx.insert(membershipHistory).values({ id: crypto.randomUUID(), gymId: user.gymId, memberId: id, membershipId, action: "created", toStatus: "active", startsAt, endsAt, performedBy: user.id });
            if (charges.total > 0) {
                const invoiceSequence = ((await (tx.select({ value: count() }).from(invoices)).where(eq(invoices.gymId, user.gymId)))[0]?.value ?? 0) + 1;
                const invoiceId = crypto.randomUUID(), invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoiceSequence).padStart(5, "0")}`;
                await tx.insert(invoices).values({ id: invoiceId, gymId: user.gymId, memberId: id, membershipId, invoiceNumber, currency: plan.currency, memberName: `${parsed.data.firstName} ${parsed.data.lastName}`, memberNumberSnapshot: memberNumber, memberEmail: parsed.data.email, memberPhone: parsed.data.phone, gymName: gym.name, gymAddress: gym.address, gymEmail: gym.email, gymPhone: gym.phone, issuedAt: startsAt, dueAt: startsAt, subtotal: charges.subtotal, discount: charges.discount, taxName: gym.taxEnabled ? gym.taxName : null, taxRate: gym.taxEnabled ? gym.taxPercentage : 0, tax: charges.tax, total: charges.total, paid: 0, balance: charges.total, status: "unpaid" });
                await tx.insert(invoiceItems).values({ id: crypto.randomUUID(), invoiceId, description: `${plan.name} membership`, quantity: 1, unitPrice: plan.price, amount: plan.price });
                if (plan.signupFee > 0) await tx.insert(invoiceItems).values({ id: crypto.randomUUID(), invoiceId, description: "Signup fee", quantity: 1, unitPrice: plan.signupFee, amount: plan.signupFee });
            }
            await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "member.created", entityType: "member", entityId: id, metadata: { memberNumber, plan: "Standard" } });
        });
    }
    catch (error) {
        if (photoPath) try { await removeMemberPhoto(photoPath, user.gymId); } catch (cleanupError) { logger.error("member.photo_cleanup_failed", cleanupError, { gymId: user.gymId, memberId: id }); }
        logger.error("member.create_failed", error, { gymId: user.gymId, memberId: id });
        return { error: "This member could not be created. Check that the email and phone are correct." };
    }
    redirect(`/members/${id}`);
}
export async function updateMember(memberId: string, _: MemberFormState, formData: FormData): Promise<MemberFormState> {
    const user = await requirePermission("members.write");
    const parsed = memberInputFromForm(formData);
    if (!parsed.success)
        return { error: "Please correct the highlighted information.", fields: parsed.error.flatten().fieldErrors };
    const existing = (await (db.select({ id: members.id, profilePhotoUrl: members.profilePhotoUrl }).from(members)).where(and(eq(members.id, memberId), eq(members.gymId, user.gymId), isNull(members.archivedAt))))[0];
    if (!existing)
        return { error: "Member not found." };
    if (!await validTrainer(user.gymId, parsed.data.trainerId))
        return { error: "The selected trainer does not belong to this gym." };
    let newPhotoPath: string | null = null;
    try { newPhotoPath = await uploadMemberPhoto(user.gymId, memberId, formData.get("photo")); }
    catch (error) { return { error: error instanceof Error && error.message === "INVALID_MEMBER_PHOTO" ? memberPhotoError : "Unable to upload photo. Please try again." }; }
    const removePhoto = formData.get("removePhoto") === "true";
    const nextPhotoPath = newPhotoPath ?? (removePhoto ? null : existing.profilePhotoUrl);
    try {
        await db.transaction(async (tx) => { await (tx.update(members).set({ ...parsed.data, profilePhotoUrl: nextPhotoPath, updatedAt: new Date() })).where(and(eq(members.id, memberId), eq(members.gymId, user.gymId))); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "member.updated", entityType: "member", entityId: memberId }); });
    } catch (error) {
        if (newPhotoPath) try { await removeMemberPhoto(newPhotoPath, user.gymId); } catch (cleanupError) { logger.error("member.photo_cleanup_failed", cleanupError, { gymId: user.gymId, memberId }); }
        logger.error("member.update_failed", error, { gymId: user.gymId, memberId });
        return { error: "This member could not be updated. Please try again." };
    }
    if (existing.profilePhotoUrl && existing.profilePhotoUrl !== nextPhotoPath) {
        try { await removeMemberPhoto(existing.profilePhotoUrl, user.gymId); }
        catch (error) { logger.error("member.old_photo_remove_failed", error, { gymId: user.gymId, memberId }); }
    }
    redirect(`/members/${memberId}`);
}
