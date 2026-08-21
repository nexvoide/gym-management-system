import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { communicationLogs, gyms, members, membershipPlans, memberships } from "@/db/schema";
import { sendApplicationEmail } from "@/lib/email";
import { expiryMessage, welcomeMessage } from "@/lib/member-communications";
import { logger } from "@/lib/logger";

type Kind = "welcome" | "expiry_7" | "expiry_3" | "expiry_1";
function localIsoDate(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function daysUntilInTimezone(end: Date, now: Date, timezone: string) {
  const [ey, em, ed] = localIsoDate(end, timezone).split("-").map(Number);
  const [ny, nm, nd] = localIsoDate(now, timezone).split("-").map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(ny, nm - 1, nd)) / 86_400_000);
}
async function details(gymId: string, memberId: string) {
  return (await db.select({
    gymId: gyms.id, gymName: gyms.name, gymEmail: gyms.email, gymPhone: gyms.phone, locale: gyms.locale, timezone: gyms.timezone,
    memberId: members.id, memberName: members.firstName, memberLastName: members.lastName, email: members.email,
    emailEnabled: members.emailNotificationsEnabled, membershipId: memberships.id, startsAt: memberships.startsAt,
    endsAt: memberships.endsAt, planName: membershipPlans.name,
  }).from(members).innerJoin(gyms, eq(gyms.id, members.gymId)).innerJoin(memberships, eq(memberships.memberId, members.id)).innerJoin(membershipPlans, eq(membershipPlans.id, memberships.planId))
    .where(and(eq(members.gymId, gymId), eq(members.id, memberId), isNull(members.archivedAt))).orderBy(desc(memberships.endsAt)).limit(1))[0];
}
async function claim(input: { gymId: string; memberId: string; membershipId: string; kind: Kind; dedupeKey: string; recipient: string; createdBy?: string }) {
  return (await db.insert(communicationLogs).values({ id: crypto.randomUUID(), gymId: input.gymId, memberId: input.memberId, membershipId: input.membershipId, kind: input.kind, channel: "email", status: "claimed", dedupeKey: input.dedupeKey, recipient: input.recipient, createdBy: input.createdBy }).onConflictDoNothing().returning({ id: communicationLogs.id }))[0];
}
export async function sendMemberWelcomeEmail(gymId: string, memberId: string, createdBy?: string) {
  const row = await details(gymId, memberId); if (!row?.email || !row.emailEnabled) return { sent: false, reason: "missing_or_disabled" } as const;
  const claimed = await claim({ gymId, memberId, membershipId: row.membershipId, kind: "welcome", dedupeKey: `welcome:${row.membershipId}`, recipient: row.email, createdBy });
  if (!claimed) return { sent: false, reason: "duplicate" } as const;
  try {
    await sendApplicationEmail(welcomeMessage({ to: row.email, memberName: `${row.memberName} ${row.memberLastName}`, gymName: row.gymName, planName: row.planName, startsAt: row.startsAt, endsAt: row.endsAt, locale: row.locale, timezone: row.timezone, gymContact: row.gymEmail ?? row.gymPhone }));
    await db.update(communicationLogs).set({ status: "sent", sentAt: new Date() }).where(eq(communicationLogs.id, claimed.id)); return { sent: true } as const;
  } catch (error) { await db.update(communicationLogs).set({ status: "failed" }).where(eq(communicationLogs.id, claimed.id)); logger.error("member.welcome_email_failed", error, { gymId, memberId }); return { sent: false, reason: "delivery_failed" } as const; }
}
export async function sendMemberExpiryEmail(gymId: string, memberId: string, createdBy?: string, automaticDay?: 7 | 3 | 1) {
  const row = await details(gymId, memberId); if (!row?.email || !row.emailEnabled) return { sent: false, reason: "missing_or_disabled" } as const;
  const kind: Kind = automaticDay ? `expiry_${automaticDay}` : "expiry_1";
  const dedupeKey = automaticDay ? `expiry:${row.membershipId}:${automaticDay}` : `manual-expiry:${row.membershipId}:${localIsoDate(new Date(), row.timezone)}`;
  const claimed = await claim({ gymId, memberId, membershipId: row.membershipId, kind, dedupeKey, recipient: row.email, createdBy }); if (!claimed) return { sent: false, reason: "duplicate" } as const;
  try {
    await sendApplicationEmail(expiryMessage({ to: row.email, memberName: `${row.memberName} ${row.memberLastName}`, gymName: row.gymName, planName: row.planName, endsAt: row.endsAt, locale: row.locale, timezone: row.timezone, gymContact: row.gymEmail ?? row.gymPhone }));
    await db.update(communicationLogs).set({ status: "sent", sentAt: new Date() }).where(eq(communicationLogs.id, claimed.id)); return { sent: true } as const;
  } catch (error) { await db.update(communicationLogs).set({ status: "failed" }).where(eq(communicationLogs.id, claimed.id)); logger.error("member.expiry_email_failed", error, { gymId, memberId }); return { sent: false, reason: "delivery_failed" } as const; }
}
export async function processExpiryReminders(gymId: string, now = new Date()) {
  const gym = (await db.select().from(gyms).where(eq(gyms.id, gymId)))[0]; if (!gym?.expiryRemindersEnabled) return;
  const days = Array.isArray(gym.expiryReminderDays) ? gym.expiryReminderDays.filter((day): day is 7 | 3 | 1 => day === 7 || day === 3 || day === 1) : [];
  const rows = await db.select({ memberId: members.id, endsAt: memberships.endsAt }).from(members).innerJoin(memberships, eq(memberships.memberId, members.id)).where(and(eq(members.gymId, gymId), eq(memberships.status, "active"), isNull(members.archivedAt)));
  for (const row of rows) { const day = daysUntilInTimezone(row.endsAt, now, gym.timezone); if (days.includes(day as 7 | 3 | 1)) await sendMemberExpiryEmail(gymId, row.memberId, undefined, day as 7 | 3 | 1); }
}
