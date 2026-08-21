import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("professional themes expose the complete centralized token contract", async () => {
  const css = await readFile("src/app/globals.css", "utf8");
  for (const theme of ["midnight", "titanium", "carbon"]) assert.ok(css.includes(`data-skin="${theme}"`));
  for (const token of ["background", "surface", "surface-secondary", "surface-hover", "primary", "primary-hover", "primary-soft", "primary-foreground", "text-primary", "text-secondary", "text-muted", "border", "success", "warning", "danger", "info"]) assert.ok(css.includes(`--${token}:`));
  for (const obsolete of ['data-skin="slate"', 'data-skin="light"', "#B7FF00", "rgba(183,255,0"]) assert.equal(css.toLowerCase().includes(obsolete.toLowerCase()), false);
});
test("selector updates immediately and persists only the three supported themes", async () => {
  const [selector, action, schema] = await Promise.all([readFile("src/components/theme-selector.tsx", "utf8"), readFile("src/app/(app)/settings/actions.ts", "utf8"), readFile("src/db/schema.ts", "utf8")]);
  assert.match(selector, /setAttribute\("data-skin", theme\)/); assert.match(selector, /await action\(theme\)/);
  for (const theme of ["midnight", "titanium", "carbon"]) { assert.ok(selector.includes(theme)); assert.ok(action.includes(theme)); assert.ok(schema.includes(theme)); }
});
test("theme migration preserves equivalent existing preferences", async () => {
  const migration = await readFile("supabase/migrations/20260821230000_replace_gym_themes.sql", "utf8");
  assert.match(migration, /when 'light' then 'titanium'/); assert.match(migration, /when 'slate' then 'carbon'/); assert.match(migration, /default 'midnight'/);
});
