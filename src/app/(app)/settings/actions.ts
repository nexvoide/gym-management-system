"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, gyms } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
export async function updateGymProfile(formData: FormData) {
    const user = await requirePermission("settings.write");
    const result = z.object({ name: z.string().trim().min(2).max(80), phone: z.string().trim().max(30), email: z.union([z.literal(""), z.email()]), address: z.string().trim().max(240), timezone: z.string().min(1), currency: z.string().length(3), locale: z.string().min(2).max(10) }).safeParse(Object.fromEntries(formData));
    if (!result.success)
        throw new Error("Invalid gym profile settings.");
    await db.transaction(async (tx) => { await (tx.update(gyms).set({ ...result.data, updatedAt: new Date() })).where(eq(gyms.id, user.gymId)); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "settings.updated", entityType: "gym", entityId: user.gymId, metadata: { fields: Object.keys(result.data) } }); });
    revalidatePath("/settings");
}
