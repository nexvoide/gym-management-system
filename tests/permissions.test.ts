import assert from "node:assert/strict";
import test from "node:test";
import { can, permissionKeys, rolePermissionMap } from "../src/lib/permissions";
test("super admin receives every declared permission", () => {
    assert.deepEqual(rolePermissionMap.owner, permissionKeys);
});
test("receptionists can run front desk workflows but not sensitive settings", () => {
    assert.equal(can("receptionist", "members.write"), true);
    assert.equal(can("receptionist", "attendance.write"), true);
    assert.equal(can("receptionist", "attendance.override"), false);
    assert.equal(can("receptionist", "payments.write"), true);
    assert.equal(can("receptionist", "settings.read"), false);
    assert.equal(can("receptionist", "reports.read"), false);
});
test("trainers cannot access financial or administrative information", () => {
    assert.equal(can("trainer", "members.read"), true);
    assert.equal(can("trainer", "attendance.read"), true);
    assert.equal(can("trainer", "attendance.override"), false);
    assert.equal(can("trainer", "payments.read"), false);
    assert.equal(can("trainer", "expenses.read"), false);
    assert.equal(can("trainer", "settings.write"), false);
});
