"use server";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, gyms, trainers } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { moneyToMinor } from "@/lib/membership";
export type TrainerState = {
    error?: string;
    fields?: Record<string, string[]>;
};
const optional = (max: number) => z.string().trim().max(max).optional().transform(value => value || null);
const schema = z.object({ name: z.string().trim().min(2).max(100), photoUrl: z.union([z.literal(""), z.url()]).optional().transform(v => v || null), phone: optional(30), email: z.union([z.literal(""), z.email()]).optional().transform(v => v?.toLowerCase() || null), specialization: optional(100), joiningDate: z.string().optional().transform(v => v ? new Date(`${v}T00:00:00`) : null), salaryAmount: z.string().trim().optional().transform(v => v || null), salaryPeriod: z.union([z.literal(""), z.enum(["hourly", "per_session", "weekly", "monthly"])]).transform(v => v || null), status: z.enum(["active", "inactive"]), notes: optional(1000) });
async function trainerValues(gymId: string, parsed: z.infer<typeof schema>) {
    const gym = (await db.select({ currency: gyms.currency }).from(gyms).where(eq(gyms.id, gymId)))[0];
    if (!gym) throw new Error("Gym billing settings could not be found.");
    if (parsed.salaryAmount !== null) moneyToMinor(parsed.salaryAmount, gym.currency);
    return { ...parsed, salaryAmount: parsed.salaryAmount === null ? null : Number(parsed.salaryAmount), salaryCurrency: parsed.salaryAmount === null ? null : gym.currency, salaryPeriod: parsed.salaryAmount === null ? null : parsed.salaryPeriod };
}
export async function createTrainer(_: TrainerState, data: FormData): Promise<TrainerState> {
    const user = await requirePermission("trainers.write");
    const parsed = schema.safeParse(Object.fromEntries(data));
    if (!parsed.success)
        return { error: "Correct the highlighted trainer details.", fields: parsed.error.flatten().fieldErrors };
    if (parsed.data.salaryAmount !== null && !parsed.data.salaryPeriod) return { error: "Select how often the trainer is paid." };
    let values; try { values = await trainerValues(user.gymId, parsed.data); } catch (error) { return { error: error instanceof Error ? error.message : "Enter valid salary information." }; }
    const id = crypto.randomUUID();
    await db.transaction(async (tx) => { await tx.insert(trainers).values({ id, gymId: user.gymId, ...values }); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "trainer.created", entityType: "trainer", entityId: id }); });
    redirect(`/trainers/${id}`);
}
export async function updateTrainer(id: string, _: TrainerState, data: FormData): Promise<TrainerState> {
    const user = await requirePermission("trainers.write");
    const parsed = schema.safeParse(Object.fromEntries(data));
    if (!parsed.success)
        return { error: "Correct the highlighted trainer details.", fields: parsed.error.flatten().fieldErrors };
    const row = (await (db.select({ id: trainers.id }).from(trainers)).where(and(eq(trainers.id, id), eq(trainers.gymId, user.gymId), isNull(trainers.archivedAt))))[0];
    if (!row)
        return { error: "Trainer not found." };
    if (parsed.data.salaryAmount !== null && !parsed.data.salaryPeriod) return { error: "Select how often the trainer is paid." };
    let values; try { values = await trainerValues(user.gymId, parsed.data); } catch (error) { return { error: error instanceof Error ? error.message : "Enter valid salary information." }; }
    await db.transaction(async (tx) => { await (tx.update(trainers).set({ ...values, updatedAt: new Date() })).where(and(eq(trainers.id, id), eq(trainers.gymId, user.gymId))); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "trainer.updated", entityType: "trainer", entityId: id }); });
    redirect(`/trainers/${id}`);
}
