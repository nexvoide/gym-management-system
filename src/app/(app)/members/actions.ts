"use server";
import { and, count, eq, isNull, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditLogs, members, trainers } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { memberInputFromForm } from "@/lib/member-validation";
export type MemberFormState = {
    error?: string;
    fields?: Record<string, string[]>;
};
async function validTrainer(gymId: string, trainerId: string | null | undefined) { return !trainerId || Boolean((await (db.select({ id: trainers.id }).from(trainers)).where(and(eq(trainers.id, trainerId), eq(trainers.gymId, gymId), isNull(trainers.archivedAt))))[0]); }
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
    try {
        await db.transaction(async (tx) => { const sequence = ((await (tx.select({ value: count() }).from(members)).where(eq(members.gymId, user.gymId)))[0]?.value ?? 0) + 1001; await tx.insert(members).values({ id, gymId: user.gymId, memberNumber: `FM-${sequence}`, ...parsed.data }); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "member.created", entityType: "member", entityId: id, metadata: { memberNumber: `FM-${sequence}` } }); });
    }
    catch {
        return { error: "This member could not be created. Check that the email and phone are correct." };
    }
    redirect(`/members/${id}`);
}
export async function updateMember(memberId: string, _: MemberFormState, formData: FormData): Promise<MemberFormState> {
    const user = await requirePermission("members.write");
    const parsed = memberInputFromForm(formData);
    if (!parsed.success)
        return { error: "Please correct the highlighted information.", fields: parsed.error.flatten().fieldErrors };
    const existing = (await (db.select({ id: members.id }).from(members)).where(and(eq(members.id, memberId), eq(members.gymId, user.gymId), isNull(members.archivedAt))))[0];
    if (!existing)
        return { error: "Member not found." };
    if (!await validTrainer(user.gymId, parsed.data.trainerId))
        return { error: "The selected trainer does not belong to this gym." };
    await db.transaction(async (tx) => { await (tx.update(members).set({ ...parsed.data, updatedAt: new Date() })).where(eq(members.id, memberId)); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "member.updated", entityType: "member", entityId: memberId }); });
    redirect(`/members/${memberId}`);
}
