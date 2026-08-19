import type { RoleKey } from "@/db/schema";

export const permissionKeys = [
  "dashboard.view", "members.read", "members.write", "members.archive", "memberships.read", "memberships.write",
  "attendance.read", "attendance.write", "attendance.override", "payments.read", "payments.write", "trainers.read", "trainers.write",
  "expenses.read", "expenses.write", "reports.read", "settings.read", "settings.write", "users.manage", "audit.read",
] as const;
export type Permission = (typeof permissionKeys)[number];

export const rolePermissionMap: Record<RoleKey, readonly Permission[]> = {
  owner: permissionKeys,
  manager: permissionKeys.filter((key) => !["audit.read"].includes(key)),
  receptionist: ["dashboard.view", "members.read", "members.write", "memberships.read", "memberships.write", "attendance.read", "attendance.write", "payments.read", "payments.write", "trainers.read"],
  trainer: ["dashboard.view", "members.read", "attendance.read", "trainers.read"],
};

export function can(role: RoleKey, permission: Permission) {
  return rolePermissionMap[role].includes(permission);
}
