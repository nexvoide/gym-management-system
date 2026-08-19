"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { notificationReads, notifications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { markNotificationRead, notificationFeed } from "@/lib/notifications";
export async function markRead(id: string) {
    const user = await requireUser();
    const row = (await (db.select({ id: notifications.id }).from(notifications)).where(and(eq(notifications.id, id), eq(notifications.gymId, user.gymId))))[0];
    if (row)
        await markNotificationRead(id, user.id);
    revalidatePath("/notifications");
    revalidatePath("/", "layout");
}
export async function markAllRead() {
    const user = await requireUser();
    const unread = (await notificationFeed(user.gymId, user.id, user.role)).filter(row => !row.readAt);
    for (const row of unread)
        await (db.insert(notificationReads).values({ notificationId: row.id, userId: user.id })).onConflictDoNothing();
    revalidatePath("/notifications");
    revalidatePath("/", "layout");
}
