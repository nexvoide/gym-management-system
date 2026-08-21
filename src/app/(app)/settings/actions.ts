"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, gyms } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { removeGymLogo, uploadGymLogo } from "@/lib/gym-branding";

const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null);
export async function updateGymProfile(formData: FormData) {
  const user = await requirePermission("settings.write");
  const result = z.object({ name: z.string().trim().min(2).max(80), phone: optionalText(30), email: z.union([z.literal(""), z.email()]).transform((v) => v || null), address: optionalText(240), website: optionalText(240), whatsappPhone: optionalText(30), country: z.string().trim().length(2).transform((v) => v.toUpperCase()), timezone: z.string().min(1).max(80), currency: z.string().trim().length(3).transform((v) => v.toUpperCase()), locale: z.string().min(2).max(35), dateFormat: z.enum(["short", "medium", "long"]), firstDayOfWeek: z.coerce.number().int().min(0).max(6), taxEnabled: z.preprocess((v) => v === "on", z.boolean()), taxName: optionalText(30), taxPercentage: z.coerce.number().min(0).max(100) }).safeParse(Object.fromEntries(formData));
  if (!result.success) throw new Error("Invalid gym profile settings.");
  try { new Intl.DateTimeFormat(result.data.locale, { timeZone: result.data.timezone }); new Intl.NumberFormat(result.data.locale, { style: "currency", currency: result.data.currency }); } catch { throw new Error("Enter a valid locale, timezone, and ISO currency code."); }
  await db.transaction(async (tx) => { await tx.update(gyms).set({ ...result.data, updatedAt: new Date() }).where(eq(gyms.id, user.gymId)); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "settings.updated", entityType: "gym", entityId: user.gymId, metadata: { fields: Object.keys(result.data) } }); });
  revalidatePath("/settings");
}
export async function updateAppearance(formData: FormData) {
  const user = await requirePermission("settings.write"); if (user.role !== "owner") throw new Error("Only the gym owner can change branding.");
  const skin = z.enum(["midnight", "slate", "light"]).parse(formData.get("skin"));
  await db.update(gyms).set({ skin, updatedAt: new Date() }).where(eq(gyms.id, user.gymId));
  await db.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "branding.skin_updated", entityType: "gym", entityId: user.gymId, metadata: { skin } }); revalidatePath("/", "layout");
}
export async function updateCommunicationSettings(formData: FormData) {
  const user = await requirePermission("settings.write"); const reminderDays = [7, 3, 1].filter((day) => formData.get(`reminder${day}`) === "on");
  const values = { autoWelcomeEmail: formData.get("autoWelcomeEmail") === "on", expiryRemindersEnabled: formData.get("expiryRemindersEnabled") === "on", expiryReminderDays: reminderDays };
  await db.update(gyms).set({ ...values, updatedAt: new Date() }).where(eq(gyms.id, user.gymId));
  await db.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "communications.settings_updated", entityType: "gym", entityId: user.gymId, metadata: values }); revalidatePath("/settings");
}
export async function replaceGymLogo(formData: FormData) {
  const user = await requirePermission("settings.write"); if (user.role !== "owner") throw new Error("Only the gym owner can change branding.");
  const current = (await db.select({ logoUrl: gyms.logoUrl }).from(gyms).where(eq(gyms.id, user.gymId)))[0]?.logoUrl ?? null; const next = await uploadGymLogo(user.gymId, formData.get("logo")); if (!next) throw new Error("Select a JPG, PNG, or WEBP logo.");
  await db.update(gyms).set({ logoUrl: next, updatedAt: new Date() }).where(eq(gyms.id, user.gymId)); if (current) await removeGymLogo(current, user.gymId); revalidatePath("/", "layout");
}
export async function deleteGymLogo() {
  const user = await requirePermission("settings.write"); if (user.role !== "owner") throw new Error("Only the gym owner can change branding.");
  const current = (await db.select({ logoUrl: gyms.logoUrl }).from(gyms).where(eq(gyms.id, user.gymId)))[0]?.logoUrl ?? null; if (current) await removeGymLogo(current, user.gymId);
  await db.update(gyms).set({ logoUrl: null, updatedAt: new Date() }).where(eq(gyms.id, user.gymId)); revalidatePath("/", "layout");
}
