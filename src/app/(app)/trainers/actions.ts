"use server";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, trainers } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
export type TrainerState = {
    error?: string;
    fields?: Record<string, string[]>;
};
const optional = (max: number) => z.string().trim().max(max).optional().transform(value => value || null);
const schema = z.object({ name: z.string().trim().min(2).max(100), photoUrl: z.union([z.literal(""), z.url()]).optional().transform(v => v || null), phone: optional(30), email: z.union([z.literal(""), z.email()]).optional().transform(v => v?.toLowerCase() || null), specialization: optional(100), joiningDate: z.string().optional().transform(v => v ? new Date(`${v}T00:00:00`) : null), status: z.enum(["active", "inactive"]), notes: optional(1000) });
export async function createTrainer(_: TrainerState, data: FormData): Promise<TrainerState> {
    const user = await requirePermission("trainers.write");
    const parsed = schema.safeParse(Object.fromEntries(data));
    if (!parsed.success)
        return { error: "Correct the highlighted trainer details.", fields: parsed.error.flatten().fieldErrors };
    const id = crypto.randomUUID();
    await db.transaction(async (tx) => { await tx.insert(trainers).values({ id, gymId: user.gymId, ...parsed.data }); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "trainer.created", entityType: "trainer", entityId: id }); });
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
    await db.transaction(async (tx) => { await (tx.update(trainers).set({ ...parsed.data, updatedAt: new Date() })).where(eq(trainers.id, id)); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "trainer.updated", entityType: "trainer", entityId: id }); });
    redirect(`/trainers/${id}`);
}
