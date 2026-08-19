import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { attendance } from "../src/db/schema";
import { attendanceCandidate, attendanceTotals, localDateFor } from "../src/lib/attendance";
test("local attendance date respects the gym timezone", () => { const instant = new Date("2026-08-18T20:30:00.000Z"); assert.equal(localDateFor("Asia/Karachi", instant), "2026-08-19"); assert.equal(localDateFor("America/New_York", instant), "2026-08-18"); });
test("entry validation accepts current membership and rejects expired membership", async () => { assert.equal((await attendanceCandidate("gym_form_demo", "member_demo_001"))?.valid, true); assert.equal((await attendanceCandidate("gym_form_demo", "member_demo_045"))?.valid, false); });
test("attendance totals come from recorded visits", async () => { const totals = await attendanceTotals("gym_form_demo", "Asia/Karachi"); assert.ok(totals.month > 0); assert.ok(totals.week >= totals.today); });
test("database prevents duplicate open check-ins", async () => {
    const now = new Date(), first = "attendance_constraint_test_1", second = "attendance_constraint_test_2";
    try {
        await db.insert(attendance).values({ id: first, gymId: "gym_form_demo", memberId: "member_demo_001", membershipId: "membership_demo_1", localDate: localDateFor("Asia/Karachi", now), checkInAt: now, method: "manual_search", staffUserId: "user_admin" });
        await assert.rejects(db.insert(attendance).values({ id: second, gymId: "gym_form_demo", memberId: "member_demo_001", membershipId: "membership_demo_1", localDate: localDateFor("Asia/Karachi", now), checkInAt: now, method: "manual_search", staffUserId: "user_admin" }));
    }
    finally {
        await (db.delete(attendance)).where(eq(attendance.id, first));
        await (db.delete(attendance)).where(eq(attendance.id, second));
    }
});
