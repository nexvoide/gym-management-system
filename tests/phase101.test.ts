import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { addPlanDuration, calculateCharges, formatMoney, invoiceStatus, membershipStatus, moneyToMinor, renewalWindow } from "../src/lib/membership";

const migration = readFileSync("supabase/migrations/20260821213000_phase_10_1_global_membership_billing.sql", "utf8");
const membershipActions = readFileSync("src/app/(app)/memberships/actions.ts", "utf8");
const paymentActions = readFileSync("src/app/(app)/payments/actions.ts", "utf8");
const paymentPage = readFileSync("src/app/(app)/payments/page.tsx", "utf8");

test("calendar durations clamp safely at month and leap-year boundaries", () => {
  assert.equal(addPlanDuration(new Date("2025-01-31T12:00:00Z"), 1, "months").toISOString().slice(0, 10), "2025-02-28");
  assert.equal(addPlanDuration(new Date("2024-01-31T12:00:00Z"), 1, "months").toISOString().slice(0, 10), "2024-02-29");
  assert.equal(addPlanDuration(new Date("2024-02-29T12:00:00Z"), 1, "years").toISOString().slice(0, 10), "2025-02-28");
  assert.equal(addPlanDuration(new Date("2025-12-31T12:00:00Z"), 1, "months").toISOString().slice(0, 10), "2026-01-31");
  assert.equal(renewalWindow(new Date("2025-01-15T12:00:00Z"), 1, "months", new Date("2025-02-01T12:00:00Z")).startsAt.toISOString().slice(0, 10), "2025-02-01");
});

test("money calculations use currency minor units and exact discount/tax rules", () => {
  assert.equal(moneyToMinor("0.10", "USD") + moneyToMinor("0.20", "USD"), 30n);
  assert.equal(moneyToMinor("1.234", "KWD"), 1234n);
  assert.throws(() => moneyToMinor("1.001", "USD"), /at most 2 decimal/);
  assert.deepEqual(calculateCharges({ price: "100.00", signupFee: "10.00", discountType: "percentage", discountValue: "10", taxPercentage: "5", currency: "USD" }), { subtotal: 110, discount: 11, tax: 4.95, total: 103.95 });
  assert.deepEqual(calculateCharges({ price: "100", discountType: "fixed", discountValue: "15", taxPercentage: "0", currency: "AED" }), { subtotal: 100, discount: 15, tax: 0, total: 85 });
  assert.throws(() => calculateCharges({ price: "10", discountType: "fixed", discountValue: "11", currency: "GBP" }), /exceed/);
});

test("membership and invoice state transitions are centralized", () => {
  const now = new Date("2025-06-15T12:00:00Z");
  assert.equal(membershipStatus(new Date("2025-07-01T12:00:00Z"), new Date("2025-08-01T12:00:00Z"), "active", now), "pending");
  assert.equal(membershipStatus(new Date("2025-05-01T12:00:00Z"), new Date("2025-06-01T12:00:00Z"), "active", now), "expired");
  assert.equal(membershipStatus(new Date("2025-05-01T12:00:00Z"), new Date("2025-07-01T12:00:00Z"), "frozen", now), "frozen");
  assert.equal(invoiceStatus(100, 0), "unpaid");
  assert.equal(invoiceStatus(100, 25), "partially_paid");
  assert.equal(invoiceStatus(100, 100), "paid");
});

test("global currency and locale formatting supports launch markets", () => {
  for (const [currency, locale] of [["USD", "en-US"], ["GBP", "en-GB"], ["EUR", "de-DE"], ["AED", "en-AE"], ["SAR", "ar-SA"], ["PKR", "en-PK"]]) {
    assert.doesNotThrow(() => formatMoney(1234.56, currency, locale));
  }
});

test("migration is additive, snapshots billing facts, and enforces payment currency", () => {
  assert.match(migration, /add column if not exists currency/i);
  assert.match(migration, /member_name/i);
  assert.match(migration, /gym_name/i);
  assert.match(migration, /duration_unit/i);
  assert.match(migration, /foreign key \(invoice_id,\s*currency\)/i);
  assert.doesNotMatch(migration, /drop table|truncate/i);
});

test("billing writes are tenant scoped and cross-currency operations are rejected", () => {
  assert.match(membershipActions, /eq\(membershipPlans\.gymId, user\.gymId\)/);
  assert.match(membershipActions, /eq\(members\.gymId, user\.gymId\)/);
  assert.match(membershipActions, /plan\.currency !== gym\.currency/);
  assert.match(paymentActions, /eq\(invoices\.gymId, user\.gymId\)/);
  assert.match(paymentActions, /moneyToMinor/);
  assert.match(paymentPage, /Never combine monetary totals across currencies/);
  assert.match(paymentPage, /eq\(invoices\.currency, currentCurrency\)/);
});
