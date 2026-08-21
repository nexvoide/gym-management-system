import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isMemberPhotoPathForGym, memberPhotoError, memberPhotoMaxBytes, validateMemberPhoto } from "../src/lib/member-photos";

const migration = readFileSync("supabase/migrations/20260821190000_phase_10_member_photos_standard_plan.sql", "utf8");
const actions = readFileSync("src/app/(app)/members/actions.ts", "utf8");
const form = readFileSync("src/components/member-form.tsx", "utf8");
const avatar = readFileSync("src/components/member-avatar.tsx", "utf8");

test("valid member photo signatures are accepted", async () => {
  const png = new File([new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0])], "ignored.png", { type: "image/png" });
  const result = await validateMemberPhoto(png);
  assert.equal(result?.extension, "png");
  assert.equal(result?.contentType, "image/png");
});

test("spoofed and oversized member photos are rejected", async () => {
  const spoofed = new File(["not an image"], "fake.jpg", { type: "image/jpeg" });
  await assert.rejects(validateMemberPhoto(spoofed), /INVALID_MEMBER_PHOTO/);
  const oversized = new File([new Uint8Array(memberPhotoMaxBytes + 1)], "large.png", { type: "image/png" });
  await assert.rejects(validateMemberPhoto(oversized), /INVALID_MEMBER_PHOTO/);
  assert.match(memberPhotoError, /JPG, PNG, or WEBP/);
});

test("member photo paths are tenant scoped and reject traversal", () => {
  assert.equal(isMemberPhotoPathForGym("gym-a/members/member-1/photo.webp", "gym-a"), true);
  assert.equal(isMemberPhotoPathForGym("gym-b/members/member-1/photo.webp", "gym-a"), false);
  assert.equal(isMemberPhotoPathForGym("gym-a/members/../gym-b/photo.webp", "gym-a"), false);
});

test("new gyms and existing gyms receive one non-billable Standard default without deleting custom plans", () => {
  const accounts = readFileSync("src/lib/accounts.ts", "utf8");
  assert.match(accounts, /name: "Standard"/);
  assert.match(accounts, /duration: 1, durationUnit: "months"/);
  assert.match(accounts, /durationDays: 30/);
  assert.match(accounts, /price: 0/);
  assert.match(migration, /where not exists[\s\S]*lower\(mp\.name\) = 'standard'/);
  assert.doesNotMatch(migration, /delete from public\.membership_plans/i);
});

test("member creation assigns the tenant Standard membership and preserves priced-plan invoicing", () => {
  assert.match(actions, /eq\(membershipPlans\.gymId, gymId\)/);
  assert.match(actions, /ilike\(membershipPlans\.name, "Standard"\)/);
  assert.match(actions, /tx\.insert\(memberships\)/);
  assert.match(actions, /planId: plan\.id/);
  assert.match(actions, /if \(charges\.total > 0\)/);
  assert.ok(actions.indexOf("tx.insert(members).values") < actions.indexOf("tx.insert(memberships).values"));
});

test("private Storage policies enforce tenant-scoped read and write permissions", () => {
  assert.match(migration, /'member-photos', 'member-photos', false/);
  assert.match(migration, /file_size_limit = excluded\.file_size_limit/);
  assert.match(migration, /private\.can_read_member_photo\(\(storage\.foldername\(name\)\)\[1\], \(storage\.foldername\(name\)\)\[3\]\)/);
  assert.match(migration, /r\.key <> 'trainer'[\s\S]*m\.id = target_member_id/);
  assert.match(migration, /private\.has_gym_permission\(\(storage\.foldername\(name\)\)\[1\], 'members\.write'\)/);
  assert.match(migration, /for insert to authenticated/);
  assert.match(migration, /for update to authenticated/);
  assert.match(migration, /for delete to authenticated/);
  assert.doesNotMatch(migration, /using \(true\)|with check \(true\)/);
});

test("photo replacement associates the new path before old-object cleanup", () => {
  assert.ok(actions.indexOf("profilePhotoUrl: nextPhotoPath") < actions.indexOf("removeMemberPhoto(existing.profilePhotoUrl"));
  assert.match(actions, /removeMemberPhoto\(newPhotoPath/);
  assert.match(form, /name="removePhoto"/);
  assert.match(form, /accept="image\/jpeg,image\/png,image\/webp"/);
});

test("member UI uses uploaded photos with an intentional initials fallback", () => {
  assert.match(avatar, /photoUrl \? <Image/);
  assert.match(avatar, /: initials/);
  assert.match(form, /Standard membership will be assigned automatically/);
});
