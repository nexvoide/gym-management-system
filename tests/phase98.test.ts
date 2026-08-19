import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { like } from "drizzle-orm";
import { db } from "../src/db/index";
import { requestLimits } from "../src/db/schema";
import { clearLimit, consumeLimit, isLimited } from "../src/lib/rate-limit";

test("shared PostgreSQL limiter enforces and resets independent scopes", async () => {
  const scope = `test:${crypto.randomUUID()}`;
  try {
    assert.equal((await consumeLimit(scope, "person@example.test", 2, 60_000)).allowed, true);
    assert.equal((await consumeLimit(scope, "person@example.test", 2, 60_000)).allowed, true);
    assert.equal((await consumeLimit(scope, "person@example.test", 2, 60_000)).allowed, false);
    assert.equal(await isLimited(scope,"person@example.test",2),true);
    await clearLimit(scope,"person@example.test");
    assert.equal(await isLimited(scope,"person@example.test",2),false);
    assert.equal((await consumeLimit(scope, "other@example.test", 2, 60_000)).allowed, true);
  } finally { await db.delete(requestLimits).where(like(requestLimits.key, `${scope}:%`)); }
});

test("production hardening is configured without exposing diagnostics", () => {
  const config=readFileSync("next.config.ts","utf8"),health=readFileSync("src/app/api/health/route.ts","utf8"),env=readFileSync("src/lib/env.ts","utf8"),logger=readFileSync("src/lib/logger.ts","utf8");
  for(const header of ["Content-Security-Policy","Strict-Transport-Security","X-Content-Type-Options","Referrer-Policy","Permissions-Policy","X-Frame-Options"])assert.match(config,new RegExp(header));
  assert.match(health,/status: "unavailable"/);assert.doesNotMatch(health,/error\.message|DATABASE_URL/);
  assert.match(env,/Production cannot use a local or SQLite database/);assert.match(logger,/password\|secret\|token/);
});

test("auth abuse controls are shared and recovery is enumeration-safe",()=>{const login=readFileSync("src/app/login/actions.ts","utf8"),register=readFileSync("src/app/register/actions.ts","utf8"),forgot=readFileSync("src/app/forgot-password/actions.ts","utf8"),form=readFileSync("src/app/forgot-password/forgot-form.tsx","utf8");assert.match(login,/consumeLimit\("auth:login"/);assert.match(register,/consumeLimit\("auth:register"/);assert.match(forgot,/consumeLimit\("auth:password-reset"/);assert.match(forgot,/sent:\s*true/);assert.match(form,/If that account exists/);});

test("login distinguishes confirmation and application mapping failures without exposing credentials",()=>{const login=readFileSync("src/app/login/actions.ts","utf8"),page=readFileSync("src/app/login/page.tsx","utf8");assert.match(login,/error\.code === "email_not_confirmed"/);assert.match(login,/auth\.application_user_missing/);assert.match(login,/auth\.application_user_inactive/);assert.match(login,/The email or password is incorrect/);assert.match(page,/Confirm your email address before signing in/);});
