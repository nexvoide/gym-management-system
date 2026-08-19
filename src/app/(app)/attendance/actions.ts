"use server";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { attendance, auditLogs, gyms } from "@/db/schema";
import { attendanceCandidate, localDateFor } from "@/lib/attendance";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
export type AttendanceState = {
    error?: string;
    success?: string;
};
const schema = z.object({ method: z.enum(["manual_search", "member_id"]), override: z.preprocess(value => value === "on", z.boolean()), overrideReason: z.string().trim().max(300).optional() });
export async function checkIn(memberId: string, _: AttendanceState, data: FormData): Promise<AttendanceState> {
    const user = await requirePermission("attendance.write");
    const parsed = schema.safeParse(Object.fromEntries(data));
    if (!parsed.success)
        return { error: "Invalid attendance request." };
    const candidate = await attendanceCandidate(user.gymId, memberId);
    if (!candidate)
        return { error: "Member not found." };
    if (candidate.open)
        return { error: "This member is already checked in." };
    const override = parsed.data.override;
    if (!candidate.valid && !override)
        return { error: candidate.reason ?? "Membership is not valid for entry." };
    if (override && !can(user.role, "attendance.override"))
        return { error: "Your role cannot override membership validation." };
    if (override && !parsed.data.overrideReason)
        return { error: "Add a reason for the override." };
    const gym = (await (db.select({ timezone: gyms.timezone }).from(gyms)).where(eq(gyms.id, user.gymId)))[0];
    const id = crypto.randomUUID(), now = new Date();
    try {
        await db.transaction(async (tx) => { await tx.insert(attendance).values({ id, gymId: user.gymId, memberId, membershipId: candidate.membership?.id ?? null, localDate: localDateFor(gym?.timezone ?? "UTC", now), checkInAt: now, method: parsed.data.method, overrideUsed: override, overrideReason: override ? parsed.data.overrideReason : null, staffUserId: user.id }); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "attendance.checked_in", entityType: "member", entityId: memberId, metadata: { attendanceId: id, override } }); });
    }
    catch {
        return { error: "This member is already checked in." };
    }
    revalidatePath("/attendance");
    revalidatePath(`/members/${memberId}`);
    return { success: `${candidate.member.firstName} checked in successfully.` };
}
export async function checkOut(memberId: string): Promise<void> {
    const user = await requirePermission("attendance.write");
    const visit = (await (db.select().from(attendance)).where(and(eq(attendance.gymId, user.gymId), eq(attendance.memberId, memberId), isNull(attendance.checkOutAt))))[0];
    if (!visit)
        throw new Error("No open check-in found.");
    const now = new Date();
    await db.transaction(async (tx) => { await (tx.update(attendance).set({ checkOutAt: now })).where(eq(attendance.id, visit.id)); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "attendance.checked_out", entityType: "member", entityId: memberId, metadata: { attendanceId: visit.id } }); });
    revalidatePath("/attendance");
    revalidatePath(`/members/${memberId}`);
}
