import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, gyms, passwordTokens, permissions, rolePermissions, roles, settings, trainers, users, type RoleKey } from "@/db/schema";
import { permissionKeys, rolePermissionMap } from "./permissions";
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/;
export const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");
export async function installDefaultRoles(tx: Pick<typeof db, "insert">, gymId: string) {
    const roleIds = {} as Record<RoleKey, string>;
    for (const key of ["owner", "manager", "receptionist", "trainer"] as const) {
        const id = randomUUID();
        roleIds[key] = id;
        await tx.insert(roles).values({ id, gymId, key, name: key[0].toUpperCase() + key.slice(1), description: `Default ${key} access` });
    }
    for (const key of permissionKeys)
        await (tx.insert(permissions).values({ id: `permission_${key}`, key, description: key.replace(".", " ") })).onConflictDoNothing();
    for (const key of Object.keys(roleIds) as RoleKey[])
        for (const permission of rolePermissionMap[key]) {
            await tx.insert(rolePermissions).values({ roleId: roleIds[key], permissionId: `permission_${permission}` });
        }
    return roleIds;
}
export async function registerGym(input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    gymName: string;
    country: string;
    currency: string;
    timezone: string;
}) {
    const email = normalizeEmail(input.email);
    if ((await (db.select({ id: users.id }).from(users)).where(eq(users.email, email)))[0])
        throw new Error("EMAIL_EXISTS");
    const gymId = randomUUID(), userId = randomUUID(), passwordHash = await hash(input.password, 12);
    await db.transaction(async (tx) => {
        const base = input.gymName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "gym";
        await tx.insert(gyms).values({ id: gymId, name: input.gymName, slug: `${base}-${gymId.slice(0, 8)}`, country: input.country, currency: input.currency, timezone: input.timezone, locale: input.country === "PK" ? "en-PK" : "en-US" });
        const roleIds = await installDefaultRoles(tx, gymId);
        await tx.insert(users).values({ id: userId, gymId, roleId: roleIds.owner, name: `${input.firstName} ${input.lastName}`, email, passwordHash });
        const defaults = [
            ["membership", "expiry_warning_days", [30, 7, 1]], ["membership", "freeze_rules", { extendExpiry: true, maxDays: 30 }],
            ["payment", "methods", ["Cash", "Card", "Bank Transfer", "Online", "Other"]], ["notification", "channels", { inApp: true, email: false, sms: false, whatsapp: false }],
        ] as const;
        for (const [category, key, value] of defaults)
            await tx.insert(settings).values({ id: randomUUID(), gymId, category, key, value });
        await tx.insert(auditLogs).values({ id: randomUUID(), gymId, userId, action: "gym.registered", entityType: "gym", entityId: gymId });
    });
    return { userId, gymId };
}
export async function createStaffSetupToken(userId: string) {
    const token = randomBytes(32).toString("base64url");
    await db.insert(passwordTokens).values({ id: randomUUID(), userId, purpose: "staff_setup", tokenHash: tokenDigest(token), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
    return token;
}
export async function validPasswordToken(token: string) {
    return (await (db.select({ id: passwordTokens.id, userId: passwordTokens.userId, purpose: passwordTokens.purpose }).from(passwordTokens)).where(and(eq(passwordTokens.tokenHash, tokenDigest(token)), gt(passwordTokens.expiresAt, new Date()), isNull(passwordTokens.usedAt))))[0] ?? null;
}
export async function ensureTrainerProfile(gymId: string, userId: string, name: string, email: string) {
    await db.insert(trainers).values({ id: randomUUID(), gymId, userId, name, email, status: "active", joiningDate: new Date() });
}
