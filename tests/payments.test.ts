import assert from "node:assert/strict";
import test from "node:test";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { invoiceItems, invoices } from "../src/db/schema";
import { invoiceDetail, paymentState, roundMoney } from "../src/lib/payments";
test("money is consistently rounded to two decimal places", () => { assert.equal(roundMoney(0.1 + 0.2), 0.3); assert.equal(roundMoney(49.999), 50); });
test("payment state calculates partial and complete balances", () => { assert.deepEqual(paymentState(90, 50, new Date("2099-01-01")), { paid: 50, balance: 40, status: "partially_paid" }); assert.deepEqual(paymentState(90, 90, new Date("2099-01-01")), { paid: 90, balance: 0, status: "paid" }); });
test("overdue status is derived from due date and remaining balance", () => { assert.equal(paymentState(100, 0, new Date("2020-01-01"), new Date("2026-01-01")).status, "overdue"); });
test("seeded invoice caches match the immutable payment ledger", async () => {
    const rows = await db.select({ id: invoices.id, paid: invoices.paid, total: invoices.total, balance: invoices.balance, ledger: sql<number> `coalesce((select sum(amount) from payments where invoice_id=${sql.raw("invoices.id")}),0)::double precision` }).from(invoices);
    assert.ok(rows.length >= 56);
    for (const row of rows) {
        assert.equal(roundMoney(row.paid), roundMoney(row.ledger));
        assert.equal(roundMoney(row.balance), roundMoney(row.total - row.paid));
    }
});
test("invoices have line items and a complete printable detail", async () => { const first = (await (db.select({ id: invoices.id }).from(invoices)).where(eq(invoices.gymId, "gym_form_demo")))[0]; assert.ok(first); assert.ok((await (db.select().from(invoiceItems)).where(eq(invoiceItems.invoiceId, first.id))).length > 0); assert.ok(await invoiceDetail("gym_form_demo", first.id)); });
