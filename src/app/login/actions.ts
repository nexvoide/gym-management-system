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
    if (error) {
        logger.warn("auth.login_rejected", { errorCode: error.code ?? "unknown" });
        await consumeLimit("auth:login", key, 5, 15 * 60 * 1000);
        if (error.code === "email_not_confirmed")
            return { error: "Confirm your email address before signing in. Check your inbox for the confirmation link." };
        return { error: "The email or password is incorrect." };
    }
    const user = (await (db.select({ id: users.id, active: users.active }).from(users)).where(eq(users.email, key)))[0];
    if (!user?.active) {
        await supabase.auth.signOut();
        logger.warn(user ? "auth.application_user_inactive" : "auth.application_user_missing");
        return { error: "Your account cannot access the application. Contact support." };
    }
    await clearLimit("auth:login", key);
    await (db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() })).where(eq(users.id, user.id));
    redirect("/dashboard");
}
