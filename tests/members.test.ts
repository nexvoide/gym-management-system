import assert from "node:assert/strict";
import test from "node:test";
import { memberSchema } from "../src/lib/member-validation";
import { listMembers } from "../src/lib/members";
test("member registration keeps optional fields optional", () => {
    const result = memberSchema.safeParse({ firstName: "Noor", lastName: "Ali", gender: null, status: "active" });
    assert.equal(result.success, true);
});
test("member registration rejects malformed email", () => {
    const result = memberSchema.safeParse({ firstName: "Noor", lastName: "Ali", email: "wrong", gender: null, status: "active" });
    assert.equal(result.success, false);
});
test("member directory is paginated and searchable within a gym", async () => {
    const firstPage = await listMembers("gym_form_demo", { page: 1 });
    assert.equal(firstPage.rows.length, 10);
    assert.ok(firstPage.total >= 56);
    const result = await listMembers("gym_form_demo", { q: "FM-1001", page: 1 });
    assert.equal(result.total, 1);
    assert.equal(result.rows[0]?.memberNumber, "FM-1001");
});
test("member status filters are derived from membership dates", async () => {
    const expired = await listMembers("gym_form_demo", { status: "expired", page: 1 });
    const expiring = await listMembers("gym_form_demo", { status: "expiring_soon", page: 1 });
    assert.ok(expired.total > 0);
    assert.ok(expiring.total > 0);
    assert.ok(expired.rows.every(member => member.status === "expired"));
});
