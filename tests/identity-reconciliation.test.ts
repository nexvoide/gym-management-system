import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const register = readFileSync("src/app/register/actions.ts", "utf8");
const login = readFileSync("src/app/login/actions.ts", "utf8");
const auth = readFileSync("src/lib/auth.ts", "utf8");
const accounts = readFileSync("src/lib/accounts.ts", "utf8");

test("registration creates Auth before the application owner and rejects obfuscated duplicates", () => {
  assert.ok(register.indexOf("supabase.auth.signUp") < register.indexOf("registerGym("));
  assert.match(register, /authData\.user\?\.identities\?\.length/);
  assert.match(register, /An account already exists for this email/);
  assert.match(accounts, /installDefaultRoles/);
  assert.match(accounts, /roleIds\.owner/);
});

test("login authenticates only through Supabase and rejects a missing application user", () => {
  assert.match(login, /supabase\.auth\.signInWithPassword/);
  assert.doesNotMatch(login, /bcrypt|compare\s*\(/);
  assert.match(login, /!user\?\.active/);
  assert.match(login, /supabase\.auth\.signOut/);
});

test("authenticated identity maps by normalized email to its application tenant and role", () => {
  assert.match(auth, /data\.user\?\.email\?\.toLowerCase\(\)/);
  assert.match(auth, /eq\(users\.email, email\)/);
  assert.match(auth, /gymId:\s*users\.gymId/);
  assert.match(auth, /role:\s*roles\.key/);
  assert.match(auth, /eq\(users\.active, true\)/);
});
