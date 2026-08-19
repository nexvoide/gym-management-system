"use server";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { passwordTokens, sessions, users } from "@/db/schema";
import { strongPassword, validPasswordToken } from "@/lib/accounts";
import { createClient } from "@/lib/supabase/server";
export type PasswordState = {
    error?: string;
};
export async function setPassword(_: PasswordState, data: FormData): Promise<PasswordState> {
    const recovery = data.get("recovery") === "1";
    const parsed = z.object({ token: z.string(), recovery: z.string(), password: z.string().regex(strongPassword), confirmPassword: z.string() }).refine(v => v.password === v.confirmPassword).safeParse(Object.fromEntries(data));
    if (!parsed.success)
        return { error: "Use 12+ characters with upper, lower, number, and symbol; both entries must match." };
    if (recovery) {
        const supabase = await createClient();
        const { data: identity } = await supabase.auth.getUser();
        if (!identity.user) return { error: "This recovery link is invalid or has expired." };
        const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
        if (error) return { error: "The password could not be updated. Request a new recovery link." };
        const email = identity.user.email?.trim().toLowerCase();
        if (email)
            await (db.update(users).set({ mustChangePassword: false, updatedAt: new Date() })).where(eq(users.email, email));
        redirect("/dashboard");
    }
    if (parsed.data.token.length < 32) return { error: "This setup link is invalid or has expired." };
    const record = await validPasswordToken(parsed.data.token);
    if (!record)
        return { error: "This setup link is invalid or has expired." };
    const localUser = (await (db.select({ email: users.email, name: users.name }).from(users)).where(eq(users.id, record.userId)))[0];
    if (!localUser)
        return { error: "This staff account no longer exists." };
    const supabase = await createClient();
    // Setup links are often opened by the owner who created the staff account.
    // Clear that session so the browser cannot continue into the app as the owner.
    await supabase.auth.signOut();
    const { data: authData, error: authError } = await supabase.auth.signUp({ email: localUser.email, password: parsed.data.password, options: { data: { name: localUser.name } } });
    if (authError)
        return { error: authError.message };
    if (!authData.user?.identities?.length)
        return { error: "This email already has a login. Use Forgot password to securely set a new password, then sign in." };
    const passwordHash = await hash(parsed.data.password, 12);
    await db.transaction(async (tx) => { await (tx.update(users).set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })).where(eq(users.id, record.userId)); await (tx.update(passwordTokens).set({ usedAt: new Date() })).where(eq(passwordTokens.id, record.id)); await (tx.delete(sessions)).where(eq(sessions.userId, record.userId)); });
    if (!authData.session)
        redirect("/login?confirmed=0");
    redirect("/dashboard");
}
