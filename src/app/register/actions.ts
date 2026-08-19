"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { registerGym, strongPassword } from "@/lib/accounts";
import { createClient } from "@/lib/supabase/server";
import { consumeLimit } from "@/lib/rate-limit";

export type RegisterState={error?:string;fields?:Record<string,string[]>};
const schema=z.object({firstName:z.string().trim().min(2).max(50),lastName:z.string().trim().min(2).max(50),email:z.email(),password:z.string().regex(strongPassword,"Use 12+ characters with upper, lower, number, and symbol."),confirmPassword:z.string(),gymName:z.string().trim().min(2).max(80),country:z.string().length(2),currency:z.string().length(3),timezone:z.string().min(3).max(80)}).refine(v=>v.password===v.confirmPassword,{path:["confirmPassword"],message:"Passwords do not match."});
export async function register(_:RegisterState,data:FormData):Promise<RegisterState>{
  const parsed=schema.safeParse(Object.fromEntries(data)); if(!parsed.success)return {error:"Please correct the highlighted information.",fields:parsed.error.flatten().fieldErrors};
  const supabase=await createClient();
  const email=parsed.data.email.trim().toLowerCase();
  if (!(await consumeLimit("auth:register", email, 3, 60 * 60 * 1000)).allowed) return {error:"Too many registration attempts. Please try again later."};
  const {data:authData,error:authError}=await supabase.auth.signUp({email,password:parsed.data.password,options:{data:{name:`${parsed.data.firstName} ${parsed.data.lastName}`}}});
  if(authError)return {error:authError.message};
  // Supabase deliberately obfuscates signups for an existing identity. Do not
  // create an application owner row unless this request created a real identity.
  if(!authData.user?.identities?.length){await supabase.auth.signOut();return {error:"An account already exists for this email."};}
  try{await registerGym({...parsed.data,email});}catch(error){await supabase.auth.signOut();if(error instanceof Error&&error.message==="EMAIL_EXISTS")return {error:"An account already exists for this email."};return {error:"Your gym could not be created. Please contact support before retrying."};}
  if(!authData.session)redirect("/login?confirmed=0");
  redirect("/dashboard?welcome=1");
}
