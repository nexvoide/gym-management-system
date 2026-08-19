import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("expense summary uses typed timestamp predicates",()=>{
  const source=readFileSync("src/app/(app)/expenses/page.tsx","utf8");
  assert.match(source,/gte\(expenses\.expenseDate, monthStart\)/);
  assert.match(source,/gte\(expenses\.expenseDate, weekStart\)/);
  assert.doesNotMatch(source,/expenseDate\}\s*>=\s*\$\{monthStart/);
});

test("CSP permits the configured Google font stylesheet and files",()=>{
  const config=readFileSync("next.config.ts","utf8");
  assert.match(config,/style-src[^;]*https:\/\/fonts\.googleapis\.com/);
  assert.match(config,/font-src[^;]*https:\/\/fonts\.gstatic\.com/);
});
