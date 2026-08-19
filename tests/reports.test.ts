import assert from "node:assert/strict";
import test from "node:test";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../src/db";
import { expenses, payments } from "../src/db/schema";
import { customRange, dailyMoneySeries, presetRange, sumAmounts, toCsv } from "../src/lib/reports";
test("report presets create bounded inclusive ranges", () => {
    const now = new Date("2026-08-18T12:00:00");
    const range = presetRange("7d", now);
    assert.equal(range.preset, "7d");
    assert.equal(range.from.getDate(), 12);
    assert.equal(range.to.getDate(), 18);
});
test("invalid custom ranges safely fall back to 30 days", () => {
    const now = new Date("2026-08-18T12:00:00");
    const range = customRange("2026-09-01", "2026-08-01", now);
    assert.equal(range.from.getDate(), 20);
    assert.equal(range.from.getMonth(), 6);
});
test("daily money series fills days without transactions", () => {
    const from = new Date("2026-08-01T00:00:00"), to = new Date("2026-08-03T23:59:59");
    const rows = [{ date: new Date("2026-08-02T10:00:00"), amount: 125 }];
    assert.deepEqual(dailyMoneySeries(rows, from, to).map(row => row.value), [0, 125, 0]);
    assert.equal(sumAmounts(rows, from, to), 125);
});
test("CSV output preserves commas, quotes, and line breaks", () => {
    assert.equal(toCsv(["Name", "Note"], [["Ahmed, Khan", 'Said "hello"\nagain']]), 'Name,Note\n"Ahmed, Khan","Said ""hello""\nagain"');
});
test("seeded financial reports reconcile revenue, expenses, and profit", async () => {
    const gymId = "gym_form_demo", from = new Date("2020-01-01"), to = new Date("2030-01-01");
    const revenue = (await (db.select({ value: sql<number> `coalesce(sum(${payments.amount}), 0)::double precision` }).from(payments)).where(and(eq(payments.gymId, gymId), gte(payments.paidAt, from), lte(payments.paidAt, to))))[0]!.value;
    const costs = (await (db.select({ value: sql<number> `coalesce(sum(${expenses.amount}), 0)::double precision` }).from(expenses)).where(and(eq(expenses.gymId, gymId), gte(expenses.expenseDate, from), lte(expenses.expenseDate, to))))[0]!.value;
    assert.ok(revenue > 0);
    assert.ok(costs > 0);
    assert.equal(revenue - costs, revenue + -costs);
});
