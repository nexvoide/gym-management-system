import assert from "node:assert/strict";
import test from "node:test";
import { count, eq } from "drizzle-orm";
import { db } from "../src/db";
import { notifications } from "../src/db/schema";
import { notificationFeed, syncNotifications, visibleNotificationTypes } from "../src/lib/notifications";
const gymId = "gym_form_demo";
test("notification synchronization is idempotent", async () => {
    await syncNotifications(gymId);
    const first = (await (db.select({ value: count() }).from(notifications)).where(eq(notifications.gymId, gymId)))[0]!.value;
    await syncNotifications(gymId);
    const second = (await (db.select({ value: count() }).from(notifications)).where(eq(notifications.gymId, gymId)))[0]!.value;
    assert.ok(first > 0);
    assert.equal(second, first);
});
test("notification visibility follows existing financial permissions", () => {
    assert.deepEqual(visibleNotificationTypes("trainer"), []);
    assert.deepEqual(visibleNotificationTypes("receptionist"), ["membership_expiring", "membership_expired", "payment_overdue", "payment_received"]);
    assert.equal(visibleNotificationTypes("manager").length, 4);
});
test("notification feed exposes durable alerts with safe application links", async () => {
    await syncNotifications(gymId);
    const rows = await notificationFeed(gymId, "user_admin", "owner");
    assert.ok(rows.length > 0);
    assert.ok(rows.every(row => row.href.startsWith("/")));
    assert.ok(rows.some(row => row.type === "payment_received"));
    assert.ok(rows.some(row => row.type === "payment_overdue" || row.type === "membership_expiring" || row.type === "membership_expired"));
});
