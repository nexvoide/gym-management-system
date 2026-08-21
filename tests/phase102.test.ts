import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { daysUntilInTimezone } from "../src/lib/member-communication-service";
import { expiryMessage, welcomeMessage, whatsappExpiryUrl, whatsappWelcomeUrl } from "../src/lib/member-communications";

test("welcome and expiry messages include tenant-safe dynamic details", () => {
  const common = { to: "member@example.com", memberName: "QA Member", gymName: "QA Gym", planName: "Standard", endsAt: new Date("2026-09-01T12:00:00Z"), locale: "en-GB", timezone: "Asia/Karachi" };
  const welcome = welcomeMessage({ ...common, startsAt: new Date("2026-08-01T12:00:00Z") });
  const expiry = expiryMessage(common);
  assert.match(welcome.subject, /QA Gym/); assert.match(welcome.text, /Standard/); assert.match(expiry.text, /QA Member/); assert.doesNotMatch(expiry.text, /memberId|gymId/);
});
test("WhatsApp click-to-chat is international and safely encoded", () => {
  const url = whatsappExpiryUrl({ phone: "+44 7700 900123", memberName: "QA Member", gymName: "QA Gym", planName: "Standard", expiryDate: "1 Sep 2026" });
  assert.ok(url?.startsWith("https://wa.me/447700900123?text=")); assert.match(decodeURIComponent(url!), /QA Gym/);
  const welcome = whatsappWelcomeUrl({ phone: "+44 7700 900123", memberName: "QA Member", gymName: "QA Gym", planName: "Standard", startDate: "1 Aug 2026", expiryDate: "1 Sep 2026" });
  assert.match(decodeURIComponent(welcome!), /Welcome to QA Gym/);
});
test("expiry reminder calculation uses the gym calendar date", () => {
  assert.equal(daysUntilInTimezone(new Date("2026-08-30T18:30:00Z"), new Date("2026-08-23T18:30:00Z"), "Asia/Karachi"), 7);
});
test("Phase 10.2 UI and durable idempotency are wired", async () => {
  const [settings, schema, layout, menu] = await Promise.all([
    readFile("src/app/(app)/settings/page.tsx", "utf8"), readFile("src/db/schema.ts", "utf8"), readFile("src/app/(app)/layout.tsx", "utf8"), readFile("src/components/member-communication-menu.tsx", "utf8"),
  ]);
  for (const label of ["WhatsApp number", "Automatically send a welcome email"]) assert.match(settings, new RegExp(label));
  const selector = await readFile("src/components/theme-selector.tsx", "utf8");
  for (const label of ["Midnight", "Titanium", "Carbon", "Premium dark", "Clean light", "Athletic dark"]) assert.match(selector, new RegExp(label));
  assert.match(schema, /communication_logs/); assert.match(schema, /communication_logs_gym_dedupe_unique/); assert.match(layout, /communications:expiry/);
  assert.equal((menu.match(/> Email</g) ?? []).length, 1); assert.equal((menu.match(/> WhatsApp</g) ?? []).length, 1); assert.match(menu, /Welcome message/); assert.match(menu, /Expiry reminder/);
});
