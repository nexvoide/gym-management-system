import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { requestLimits } from "@/db/schema";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function limitKey(scope: string, identity: string) { return `${scope}:${digest(identity.trim().toLowerCase())}`; }

export async function consumeLimit(scope: string, identity: string, limit: number, windowMs: number) {
  const key = limitKey(scope, identity);
  const result = await db.execute<{ count: number; expires_at: Date }>(sql`
    insert into request_limits (key, count, window_started_at, expires_at, updated_at)
    values (${key}, 1, now(), now() + (${windowMs} * interval '1 millisecond'), now())
    on conflict (key) do update set
      count = case when request_limits.expires_at <= now() then 1 else request_limits.count + 1 end,
      window_started_at = case when request_limits.expires_at <= now() then now() else request_limits.window_started_at end,
      expires_at = case when request_limits.expires_at <= now() then now() + (${windowMs} * interval '1 millisecond') else request_limits.expires_at end,
      updated_at = now()
    returning count, expires_at
  `);
  const row = result[0];
  return { allowed: Boolean(row && row.count <= limit), remaining: Math.max(0, limit - (row?.count ?? limit)), resetAt: row?.expires_at ?? new Date(Date.now() + windowMs) };
}

export async function isLimited(scope: string, identity: string, limit: number) {
  const row = (await db.select({ count: requestLimits.count, expiresAt: requestLimits.expiresAt }).from(requestLimits).where(eq(requestLimits.key, limitKey(scope, identity))))[0];
  return Boolean(row && row.expiresAt > new Date() && row.count >= limit);
}

export async function clearLimit(scope: string, identity: string) {
  await db.delete(requestLimits).where(eq(requestLimits.key, limitKey(scope, identity)));
}

export async function acquireLease(scope: string, identity: string, durationMs: number) {
  return (await consumeLimit(scope, identity, 1, durationMs)).allowed;
}
