import assert from "node:assert/strict";
import test from "node:test";
import { and, count, eq, gt, isNotNull, sql } from "drizzle-orm";
import { db } from "../src/db";
import { expenseCategories, expenses, members, trainers } from "../src/db/schema";
import { can } from "../src/lib/permissions";
const gymId = "gym_form_demo";
test("seeded trainers have complete profiles and member assignments", async () => {
    const trainerCount = (await (db.select({ value: count() }).from(trainers)).where(eq(trainers.gymId, gymId)))[0]!.value;
    const assignedMembers = (await (db.select({ value: count() }).from(members)).where(and(eq(members.gymId, gymId), isNotNull(members.trainerId))))[0]!.value;
    assert.equal(trainerCount, 3);
    assert.ok(assignedMembers >= 50);
});
test("expense seed covers the default categories with positive amounts", async () => {
    const categoryCount = (await (db.select({ value: count() }).from(expenseCategories)).where(eq(expenseCategories.gymId, gymId)))[0]!.value;
    const expenseSummary = (await (db.select({ count: count(), total: sql<number> `sum(${expenses.amount})::double precision` }).from(expenses)).where(and(eq(expenses.gymId, gymId), gt(expenses.amount, 0))))[0]!;
    assert.equal(categoryCount, 10);
    assert.ok(expenseSummary.count >= 36);
    assert.ok(expenseSummary.total > 0);
});
test("expense and trainer permissions preserve role boundaries", () => {
    assert.equal(can("manager", "expenses.write"), true);
    assert.equal(can("receptionist", "trainers.read"), true);
    assert.equal(can("receptionist", "expenses.read"), false);
    assert.equal(can("trainer", "expenses.read"), false);
    assert.equal(can("trainer", "trainers.write"), false);
});
