import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { generateStaffSetupToken, staffSetupTokenLifetimeMs, tokenDigest } from "../src/lib/accounts";
import { sendStaffInvitation, smtpConfigFrom, staffInvitationMessage } from "../src/lib/email";

test("staff setup tokens are random, hashed, and expire after 24 hours", () => {
  const now = Date.now(), first = generateStaffSetupToken(now), second = generateStaffSetupToken(now);
  assert.notEqual(first.token, second.token);
  assert.equal(first.tokenHash, tokenDigest(first.token));
  assert.equal(first.token.length >= 43, true);
  assert.equal(first.expiresAt.getTime(), now + staffSetupTokenLifetimeMs);
});

test("resend invalidates previous tokens and setup consumes one token", () => {
  const accounts = readFileSync("src/lib/accounts.ts", "utf8");
  const setup = readFileSync("src/app/set-password/actions.ts", "utf8");
  assert.match(accounts, /update\(passwordTokens\).*usedAt:[ ]*new Date\(\)/s);
  assert.match(accounts, /purpose,[ ]*"staff_setup"/);
  assert.match(setup, /update\(passwordTokens\).*usedAt:[ ]*new Date\(\)/s);
  assert.match(accounts, /gt\(passwordTokens\.expiresAt,[ ]*new Date\(\)\)/);
  assert.match(accounts, /isNull\(passwordTokens\.usedAt\)/);
});

test("SMTP configuration is server-only and validated", () => {
  assert.throws(() => smtpConfigFrom({}), /Missing SMTP configuration/);
  assert.throws(() => smtpConfigFrom({ SMTP_HOST:"smtp", SMTP_PORT:"bad", SMTP_USER:"u", SMTP_PASSWORD:"p", SMTP_FROM_EMAIL:"from@example.test", SMTP_FROM_NAME:"Form" }), /valid TCP port/);
  const config = smtpConfigFrom({ SMTP_HOST:"smtp", SMTP_PORT:"587", SMTP_USER:"u", SMTP_PASSWORD:"p", SMTP_FROM_EMAIL:"from@example.test", SMTP_FROM_NAME:"Form" });
  assert.equal(config.secure, false);
  assert.equal(Object.keys(process.env).some((key) => key.startsWith("NEXT_PUBLIC_SMTP")), false);
});

test("invitation message preserves gym, member, and role without printing the token", () => {
  const message = staffInvitationMessage({ to:"staff@example.test", name:"QA Manager", gymName:"QA Gym", role:"manager", setupUrl:"https://gym.example.test/set-password?token=secret-token" });
  assert.match(message.subject, /QA Gym/);
  assert.match(message.html, /QA Manager/);
  assert.match(message.html, /manager/);
  assert.doesNotMatch(message.text, /secret-token/);
  assert.match(message.html, /Set Up Your Account/);
});

test("email transport can be mocked and receives the HTTPS setup URL", async () => {
  const original = { ...process.env };
  Object.assign(process.env, { SMTP_HOST:"smtp", SMTP_PORT:"587", SMTP_USER:"u", SMTP_PASSWORD:"p", SMTP_FROM_EMAIL:"from@example.test", SMTP_FROM_NAME:"Form" });
  let sent: Record<string, unknown> | undefined;
  try {
    await sendStaffInvitation({ to:"staff@example.test", name:"QA Manager", gymName:"QA Gym", role:"manager", setupUrl:"https://gym.example.test/set-password?token=opaque" }, { sendMail: async (message) => { sent = message as Record<string, unknown>; return {} as never; } });
    assert.equal(sent?.to, "staff@example.test");
    assert.match(String(sent?.html), /https:\/\/gym\.example\.test\/set-password/);
  } finally { process.env = original; }
});

test("staff actions preserve authorization, role, APP_URL, failure handling, and resend limits", () => {
  const actions = readFileSync("src/app/(app)/settings/staff/actions.ts", "utf8");
  const form = readFileSync("src/app/(app)/settings/staff/staff-form.tsx", "utf8");
  const logger = readFileSync("src/lib/logger.ts", "utf8");
  assert.match(actions, /requirePermission\("users\.manage"\)/);
  assert.match(actions, /role:[ ]*parsed\.data\.role/);
  assert.match(actions, /requireAppUrl\(\).*set-password\?token=/s);
  assert.match(actions, /Staff account created, but the invitation email could not be sent/);
  assert.match(actions, /consumeLimit\("staff:invitation"/);
  assert.match(form, /invitation email sent/);
  assert.match(logger, /password\|secret\|token/);
  assert.doesNotMatch(actions, /console\./);
  assert.doesNotMatch(actions, /localhost/);
});

test("staff deletion is tenant-scoped, protects owners, removes Auth first, and preserves business history", () => {
  const actions = readFileSync("src/app/(app)/settings/staff/actions.ts", "utf8");
  const page = readFileSync("src/app/(app)/settings/staff/page.tsx", "utf8");
  const button = readFileSync("src/app/(app)/settings/staff/delete-staff-button.tsx", "utf8");
  const admin = readFileSync("src/lib/supabase/admin.ts", "utf8");
  assert.match(actions, /requirePermission\("users\.manage"\)/);
  assert.match(actions, /eq\(users\.gymId, actor\.gymId\)/);
  assert.match(actions, /target\.role === "owner"/);
  assert.match(actions, /attendanceReference \|\| expenseReference/);
  assert.match(actions, /auth\.admin\.deleteUser\(authUserId\)/);
  assert.ok(actions.indexOf("auth.admin.deleteUser(authUserId)") < actions.indexOf("tx.delete(users)"));
  assert.match(actions, /userId: null, status: "inactive"/);
  assert.match(page, /cannot be deleted\. Deactivate the account instead/);
  assert.match(button, /window\.confirm/);
  assert.match(admin, /SUPABASE_SECRET_KEY/);
  assert.match(admin, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(page, /auth-unauthorized/);
  assert.match(page, /auth-storage/);
  assert.doesNotMatch(admin, /NEXT_PUBLIC_SUPABASE_SECRET/);
});
