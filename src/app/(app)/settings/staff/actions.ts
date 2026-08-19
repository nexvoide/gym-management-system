"use server";
import { randomBytes, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, roles, sessions, trainers, users } from "@/db/schema";
import { createStaffSetupToken, ensureTrainerProfile, normalizeEmail } from "@/lib/accounts";
import { requirePermission } from "@/lib/auth";
export type StaffState = {
    error?: string;
    setupPath?: string;
};
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
        revalidatePath("/settings/staff");
        return { setupPath: `/set-password?token=${encodeURIComponent(token)}` };
    }
    catch {
        return { error: "This staff account could not be created." };
    }
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
