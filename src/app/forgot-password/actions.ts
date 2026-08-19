"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { consumeLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { requireAppUrl } from "@/lib/env";
export type ForgotState = { sent?: boolean; error?: string };
export async function requestPasswordReset(_: ForgotState, data: FormData): Promise<ForgotState> { const parsed=z.email().safeParse(data.get("email"));if(!parsed.success)return {error:"Enter a valid email address."};const email=parsed.data.trim().toLowerCase();if(!(await consumeLimit("auth:password-reset",email,3,60*60*1000)).allowed)return {sent:true};let appUrl:string;try{appUrl=requireAppUrl()}catch{logger.error("auth.password_reset_missing_app_url");return {error:"Password reset is temporarily unavailable."}}const supabase=await createClient();const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${appUrl}/auth/callback?next=/set-password?recovery=1`});if(error)logger.warn("auth.password_reset_rejected");return {sent:true};}
