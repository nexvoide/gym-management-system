import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actions=readFileSync("src/app/(app)/members/actions.ts","utf8");
const button=readFileSync("src/components/delete-member-button.tsx","utf8");
const page=readFileSync("src/app/(app)/members/[id]/page.tsx","utf8");

test("permanent member deletion is owner-only, confirmed, and tenant scoped",()=>{
  assert.match(actions,/user\.role !== "owner"/);
  assert.match(actions,/eq\(members\.gymId, user\.gymId\)/);
  assert.match(button,/answer!=="DELETE"/);
  assert.match(page,/user\.role === "owner"/);
});

test("dependent records are removed before the member without weakening foreign keys",()=>{
  for(const table of ["payments","invoiceItems","invoices","attendance","membershipFreezes","membershipHistory","memberships","notifications","auditLogs","members"]) assert.match(actions,new RegExp(`tx\\.delete\\(${table}\\)`));
  assert.ok(actions.indexOf("tx.delete(payments)") < actions.indexOf("tx.delete(members)"));
  assert.match(actions,/removeMemberPhoto\(member\.profilePhotoUrl, user\.gymId\)/);
});
