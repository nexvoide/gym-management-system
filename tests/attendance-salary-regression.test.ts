import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("attendance validates membership by gym business date and ignores cancelled historical terms",()=>{
  const source=readFileSync("src/lib/attendance.ts","utf8");
  assert.match(source,/businessDate = localDateFor\(timezone, now\)/);
  assert.match(source,/startsAt\}::date <= \$\{businessDate\}::date/);
  assert.match(source,/status\} in \('active','frozen'\)/);
  assert.match(source,/orderBy\(desc\(memberships\.createdAt\)\)/);
});

test("trainer compensation is gym-currency scoped and salary expenses require an explicit record",()=>{
  const actions=readFileSync("src/app/(app)/trainers/actions.ts","utf8");
  const profile=readFileSync("src/app/(app)/trainers/[id]/page.tsx","utf8");
  const expense=readFileSync("src/app/(app)/expenses/new/page.tsx","utf8");
  const migration=readFileSync("supabase/migrations/20260821220000_trainer_compensation_and_expenses.sql","utf8");
  assert.match(actions,/salaryCurrency: parsed\.salaryAmount === null \? null : gym\.currency/);
  assert.match(profile,/Record salary expense/);
  assert.match(expense,/Confirm the actual amount and payment date before saving/);
  assert.match(migration,/salary_amount numeric\(18,3\)/);
  assert.match(migration,/expenses add column if not exists currency/);
  assert.doesNotMatch(migration,/insert into public\.expenses/i);
});
