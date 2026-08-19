import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db/index";
import { auditLogs, gyms, members, rolePermissions, roles, settings, trainers, users } from "../src/db/schema";
import { rolePermissionMap, permissionKeys } from "../src/lib/permissions";
import { eq } from "drizzle-orm";
import { registerGym } from "../src/lib/accounts";
test("owner and staff permissions preserve financial boundaries", () => { assert.deepEqual(rolePermissionMap.owner, permissionKeys); assert.ok(rolePermissionMap.manager.includes("users.manage")); assert.ok(!rolePermissionMap.receptionist.includes("expenses.read")); assert.ok(!rolePermissionMap.receptionist.includes("reports.read")); assert.ok(!rolePermissionMap.trainer.includes("payments.read")); assert.ok(!rolePermissionMap.trainer.includes("memberships.write")); });
test("database rejects assigning a trainer from another gym", async () => {
    const source = (await (db.select({ id: trainers.id }).from(trainers)).limit(1))[0];
    assert.ok(source);
    const gymId = `test_gym_${crypto.randomUUID()}`;
    await db.insert(gyms).values({ id: gymId, name: "Isolation Test Gym", slug: gymId, country: "US", currency: "USD", timezone: "UTC", locale: "en-US" });
    try {
        await assert.rejects(db.insert(members).values({ id: crypto.randomUUID(), gymId, memberNumber: "TEST-1", firstName: "Tenant", lastName: "Boundary", trainerId: source.id }));
    }
    finally {
        await (db.delete(gyms)).where(eq(gyms.id, gymId));
    }
});
test("registration creates an isolated gym and owner defaults", async () => {
    const unique = crypto.randomUUID();
    const created = await registerGym({ firstName: "New", lastName: "Owner", email: `owner-${unique}@example.test`, password: "ValidPassword1!", gymName: "New Tenant Gym", country: "GB", currency: "GBP", timezone: "Europe/London" });
    try {
        const gym = (await (db.select().from(gyms)).where(eq(gyms.id, created.gymId)))[0];
        const owner = (await ((db.select({ gymId: users.gymId, role: roles.key }).from(users)).innerJoin(roles, eq(users.roleId, roles.id))).where(eq(users.id, created.userId)))[0];
        assert.equal(gym?.currency, "GBP");
        assert.equal(gym?.timezone, "Europe/London");
        assert.deepEqual(owner, { gymId: created.gymId, role: "owner" });
        assert.equal((await (db.select().from(settings)).where(eq(settings.gymId, created.gymId))).length, 4);
    }
    finally {
        const roleRows = await (db.select({ id: roles.id }).from(roles)).where(eq(roles.gymId, created.gymId));
        await db.transaction(async (tx) => {
            await (tx.delete(auditLogs)).where(eq(auditLogs.gymId, created.gymId));
            await (tx.delete(settings)).where(eq(settings.gymId, created.gymId));
            await (tx.delete(users)).where(eq(users.gymId, created.gymId));
            for (const role of roleRows)
                await (tx.delete(rolePermissions)).where(eq(rolePermissions.roleId, role.id));
            await (tx.delete(roles)).where(eq(roles.gymId, created.gymId));
            await (tx.delete(gyms)).where(eq(gyms.id, created.gymId));
        });
    }
});
