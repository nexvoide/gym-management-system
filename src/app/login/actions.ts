"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { clearLimit, consumeLimit, isLimited } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
export type LoginState = {
    error?: string;
};
export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
    const parsed = z.object({ email: z.email(), password: z.string().min(8) }).safeParse(Object.fromEntries(formData));
    if (!parsed.success)
        return { error: "Enter a valid email and password." };
    const key = parsed.data.email.trim().toLowerCase();
    if (await isLimited("auth:login", key, 5)) {
        logger.warn("auth.login_throttled");
        return { error: "Too many sign-in attempts. Try again in 15 minutes." };
    }
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: key, password: parsed.data.password });
    const user = (await (db.select({ id: users.id, active: users.active }).from(users)).where(eq(users.email, key)))[0];
    if (error || !user?.active) {
        if (!error)
            await supabase.auth.signOut();
        logger.warn("auth.login_failed");
        await consumeLimit("auth:login", key, 5, 15 * 60 * 1000);
        return { error: "The email or password is incorrect." };
    }
    await clearLimit("auth:login", key);
    await (db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() })).where(eq(users.id, user.id));
    redirect("/dashboard");
}
