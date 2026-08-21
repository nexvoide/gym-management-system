"use server";
import { randomBytes, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { attendance, auditLogs, expenses, gyms, roles, sessions, trainers, users } from "@/db/schema";
import { createStaffSetupToken, ensureTrainerProfile, normalizeEmail } from "@/lib/accounts";
import { requirePermission } from "@/lib/auth";
import { sendStaffInvitation } from "@/lib/email";
import { requireAppUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { consumeLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
export type StaffState = {
    error?: string;
    sent?: boolean;
};

function authDeleteFailure(error: unknown) {
    if (error instanceof Error && error.message === "Supabase Admin is not configured.") return "auth-config";
    const details = error as { status?: number; code?: string; message?: string };
    if (details.status === 401 || details.status === 403) return "auth-unauthorized";
    if (/storage|object owner|owns? objects?/i.test(details.message ?? "")) return "auth-storage";
    return "auth-failed";
}
const createSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.email(), role: z.enum(["manager", "receptionist", "trainer"]) });
export async function createStaff(_: StaffState, data: FormData): Promise<StaffState> {
    const actor = await requirePermission("users.manage");
    const parsed = createSchema.safeParse(Object.fromEntries(data));
    if (!parsed.success)
        return { error: "Enter a valid name, email, and role." };
    const email = normalizeEmail(parsed.data.email);
    if ((await (db.select({ id: users.id }).from(users)).where(eq(users.email, email)))[0])
        return { error: "An account already exists for this email." };
    const role = (await (db.select({ id: roles.id }).from(roles)).where(and(eq(roles.gymId, actor.gymId), eq(roles.key, parsed.data.role))))[0];
    if (!role)
        return { error: "That role is not configured." };
    const id = randomUUID();
    const passwordHash = await hash(randomBytes(32).toString("base64url"), 12);
    try {
        await db.transaction(async (tx) => { await tx.insert(users).values({ id, gymId: actor.gymId, roleId: role.id, name: parsed.data.name, email, passwordHash, mustChangePassword: true }); await tx.insert(auditLogs).values({ id: randomUUID(), gymId: actor.gymId, userId: actor.id, action: "staff.created", entityType: "user", entityId: id, metadata: { role: parsed.data.role } }); });
        if (parsed.data.role === "trainer")
            await ensureTrainerProfile(actor.gymId, id, parsed.data.name, email);
        const token = await createStaffSetupToken(id);
        const gym = (await (db.select({ name: gyms.name }).from(gyms)).where(eq(gyms.id, actor.gymId)))[0];
        try {
            await sendStaffInvitation({ to: email, name: parsed.data.name, gymName: gym?.name ?? "your gym", role: parsed.data.role, setupUrl: `${requireAppUrl()}/set-password?token=${encodeURIComponent(token)}` });
        } catch (error) {
            logger.error("staff.invitation_send_failed", error, { userId: id, gymId: actor.gymId });
            revalidatePath("/settings/staff");
            return { error: "Staff account created, but the invitation email could not be sent. Please resend the invitation." };
        }
        revalidatePath("/settings/staff");
        return { sent: true };
    }
    catch {
        return { error: "This staff account could not be created." };
    }
}
export async function resendStaffInvitation(userId: string) {
    const actor = await requirePermission("users.manage");
    const target = (await (((db.select({ id: users.id, name: users.name, email: users.email, active: users.active, mustChangePassword: users.mustChangePassword, role: roles.key, gymName: gyms.name }).from(users)).innerJoin(roles, eq(users.roleId, roles.id))).innerJoin(gyms, eq(users.gymId, gyms.id))).where(and(eq(users.id, userId), eq(users.gymId, actor.gymId))))[0];
    if (!target || target.role === "owner" || !target.active || !target.mustChangePassword) redirect("/settings/staff?invite=unavailable");
    if (!(await consumeLimit("staff:invitation", userId, 3, 60 * 60 * 1000)).allowed) redirect("/settings/staff?invite=limited");
    const token = await createStaffSetupToken(userId);
    try {
        await sendStaffInvitation({ to: target.email, name: target.name, gymName: target.gymName, role: target.role, setupUrl: `${requireAppUrl()}/set-password?token=${encodeURIComponent(token)}` });
    } catch (error) {
        logger.error("staff.invitation_resend_failed", error, { userId, gymId: actor.gymId });
        redirect("/settings/staff?invite=failed");
    }
    redirect("/settings/staff?invite=sent");
}
export async function setStaffStatus(userId: string, active: boolean) {
    const actor = await requirePermission("users.manage");
    const target = (await ((db.select({ id: users.id, role: roles.key }).from(users)).innerJoin(roles, eq(users.roleId, roles.id))).where(and(eq(users.id, userId), eq(users.gymId, actor.gymId))))[0];
    if (!target || target.role === "owner")
        throw new Error("Owner accounts cannot be changed here.");
    await db.transaction(async (tx) => {
        await (tx.update(users).set({ active, updatedAt: new Date() })).where(and(eq(users.id, userId), eq(users.gymId, actor.gymId)));
        if (!active)
            await (tx.delete(sessions)).where(eq(sessions.userId, userId));
        await (tx.update(trainers).set({ status: active ? "active" : "inactive", updatedAt: new Date() })).where(and(eq(trainers.gymId, actor.gymId), eq(trainers.userId, userId)));
    });
    revalidatePath("/settings/staff");
}
export async function deleteStaff(userId: string) {
    const actor = await requirePermission("users.manage");
    const target = (await ((db.select({ id: users.id, email: users.email, name: users.name, role: roles.key }).from(users)).innerJoin(roles, eq(users.roleId, roles.id))).where(and(eq(users.id, userId), eq(users.gymId, actor.gymId))))[0];
    if (!target || target.role === "owner") redirect("/settings/staff?staff=unavailable");
    const attendanceReference = (await (db.select({ id: attendance.id }).from(attendance)).where(and(eq(attendance.gymId, actor.gymId), eq(attendance.staffUserId, userId))).limit(1))[0];
    const expenseReference = (await (db.select({ id: expenses.id }).from(expenses)).where(and(eq(expenses.gymId, actor.gymId), eq(expenses.createdBy, userId))).limit(1))[0];
    if (attendanceReference || expenseReference) redirect("/settings/staff?staff=referenced");

    const authRows = await db.execute<{ id: string }>(sql`select id::text from auth.users where lower(email) = lower(${target.email}) limit 1`);
    const authUserId = authRows[0]?.id;
    if (authUserId) {
        try {
            const { error } = await createAdminClient().auth.admin.deleteUser(authUserId);
            if (error) throw error;
        } catch (error) {
            const failure = authDeleteFailure(error);
            const details = error as { status?: number; code?: string };
            logger.error("staff.auth_delete_failed", error, { userId, gymId: actor.gymId, status: details.status, errorCode: details.code });
            redirect(`/settings/staff?staff=${failure}`);
        }
    }

    try {
        await db.transaction(async (tx) => {
            await (tx.update(trainers).set({ userId: null, status: "inactive", updatedAt: new Date() })).where(and(eq(trainers.gymId, actor.gymId), eq(trainers.userId, userId)));
            await (tx.delete(users)).where(and(eq(users.id, userId), eq(users.gymId, actor.gymId)));
            await tx.insert(auditLogs).values({ id: randomUUID(), gymId: actor.gymId, userId: actor.id, action: "staff.deleted", entityType: "user", entityId: userId, metadata: { role: target.role } });
        });
    } catch (error) {
        logger.error("staff.application_delete_failed", error, { userId, gymId: actor.gymId });
        redirect("/settings/staff?staff=failed");
    }
    revalidatePath("/settings/staff");
    redirect("/settings/staff?staff=deleted");
}
export async function changeStaffRole(userId: string, data: FormData) {
    const actor = await requirePermission("users.manage");
    const parsed = z.enum(["manager", "receptionist", "trainer"]).safeParse(data.get("role"));
    if (!parsed.success)
        throw new Error("Invalid role.");
    const target = (await ((db.select({ id: users.id, role: roles.key, name: users.name, email: users.email }).from(users)).innerJoin(roles, eq(users.roleId, roles.id))).where(and(eq(users.id, userId), eq(users.gymId, actor.gymId))))[0];
    if (!target || target.role === "owner")
        throw new Error("Owner accounts cannot be changed here.");
    const role = (await (db.select({ id: roles.id }).from(roles)).where(and(eq(roles.gymId, actor.gymId), eq(roles.key, parsed.data))))[0];
    if (!role)
        throw new Error("Role not found.");
    await (db.update(users).set({ roleId: role.id, updatedAt: new Date() })).where(and(eq(users.id, userId), eq(users.gymId, actor.gymId)));
    const profile = (await (db.select({ id: trainers.id }).from(trainers)).where(and(eq(trainers.gymId, actor.gymId), eq(trainers.userId, userId))))[0];
    if (parsed.data === "trainer" && !profile)
        await ensureTrainerProfile(actor.gymId, userId, target.name, target.email);
    if (parsed.data !== "trainer" && profile)
        await (db.update(trainers).set({ userId: null, status: "inactive", updatedAt: new Date() })).where(eq(trainers.id, profile.id));
    revalidatePath("/settings/staff");
}
