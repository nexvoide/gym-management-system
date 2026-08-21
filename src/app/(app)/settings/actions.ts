"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, gyms } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
export async function updateGymProfile(formData: FormData) {
    const user = await requirePermission("settings.write");
    const result = z.object({ name: z.string().trim().min(2).max(80), phone: z.string().trim().max(30), email: z.union([z.literal(""), z.email()]), address: z.string().trim().max(240), country: z.string().trim().length(2).transform(v=>v.toUpperCase()), timezone: z.string().min(1).max(80), currency: z.string().trim().length(3).transform(v=>v.toUpperCase()), locale: z.string().min(2).max(35), dateFormat: z.enum(["short","medium","long"]), firstDayOfWeek: z.coerce.number().int().min(0).max(6), taxEnabled: z.preprocess(v=>v==="on",z.boolean()), taxName: z.string().trim().max(30).transform(v=>v||null), taxPercentage: z.coerce.number().min(0).max(100) }).safeParse(Object.fromEntries(formData));
    if (!result.success)
        throw new Error("Invalid gym profile settings.");
    try { new Intl.DateTimeFormat(result.data.locale,{timeZone:result.data.timezone}); new Intl.NumberFormat(result.data.locale,{style:"currency",currency:result.data.currency}); } catch { throw new Error("Enter a valid locale, timezone, and ISO currency code."); }
    await db.transaction(async (tx) => { await (tx.update(gyms).set({ ...result.data, updatedAt: new Date() })).where(eq(gyms.id, user.gymId)); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "settings.updated", entityType: "gym", entityId: user.gymId, metadata: { fields: Object.keys(result.data) } }); });
    revalidatePath("/settings");
}
