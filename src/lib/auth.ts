import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { gyms, members, roles, trainers, users, type RoleKey } from "@/db/schema";
import { createClient } from "./supabase/server";
import type { Permission } from "./permissions";
import { can } from "./permissions";
export async function getCurrentUser() {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    const email = data.user?.email?.toLowerCase();
    if (error || !email)
        return null;
    return (await ((db.select({ id: users.id, gymId: users.gymId, name: users.name, email: users.email, avatarUrl: users.avatarUrl, role: roles.key, mustChangePassword: users.mustChangePassword })
        .from(users)).innerJoin(roles, eq(users.roleId, roles.id))).where(and(eq(users.email, email), eq(users.active, true))))[0] ?? null;
}
export async function requireUser() {
    const user = await getCurrentUser();
    if (!user)
        redirect("/login");
    return user;
}
export async function requirePermission(permission: Permission) {
    const user = await requireUser();
    if (!can(user.role, permission))
        redirect("/forbidden");
    return user;
}
export async function getCurrentGym() {
    const user = await getCurrentUser();
    if (!user)
        return null;
    return (await (db.select().from(gyms)).where(eq(gyms.id, user.gymId)))[0] ?? null;
}
export async function requireGymAccess() {
    const user = await requireUser();
    const gym = (await (db.select().from(gyms)).where(eq(gyms.id, user.gymId)))[0];
    if (!gym)
        redirect("/login");
    return { user, gym };
}
export async function requireRole(...allowed: RoleKey[]) {
    const user = await requireUser();
    if (!allowed.includes(user.role))
        redirect("/forbidden");
    return user;
}
export async function requireMemberAccess(memberId: string, permission: Permission = "members.read") {
    const user = await requirePermission(permission);
    if (user.role !== "trainer")
        return user;
    const trainer = (await (db.select({ id: trainers.id }).from(trainers)).where(and(eq(trainers.gymId, user.gymId), eq(trainers.userId, user.id))))[0];
    if (!trainer || !(await (db.select({ id: members.id }).from(members)).where(and(eq(members.id, memberId), eq(members.gymId, user.gymId), eq(members.trainerId, trainer.id))))[0])
        redirect("/forbidden");
    return user;
}
