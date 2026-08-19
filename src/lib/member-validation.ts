import { z } from "zod";

const optionalText = (max:number) => z.string().trim().max(max).optional().transform(v=>v||null);
export const memberSchema = z.object({
  firstName:z.string().trim().min(1,"First name is required.").max(60), lastName:z.string().trim().min(1,"Last name is required.").max(60),
  profilePhotoUrl:z.union([z.literal(""),z.url("Enter a valid image URL.")]).optional().transform(v=>v||null), dateOfBirth:z.string().optional().transform(v=>v?new Date(`${v}T00:00:00`):null),
  gender:z.enum(["female","male","non_binary","prefer_not_to_say"]).nullable().optional(), phone:optionalText(30),
  email:z.union([z.literal(""),z.email("Enter a valid email address.")]).optional().transform(v=>v?.toLowerCase()||null), address:optionalText(240),
  emergencyContactName:optionalText(100), emergencyContactRelationship:optionalText(60), emergencyContactPhone:optionalText(30), notes:optionalText(1000),
  trainerId:optionalText(100), status:z.enum(["active","frozen","cancelled"]).default("active"),
});
export type MemberInput = z.infer<typeof memberSchema>;

export function memberInputFromForm(formData:FormData){const raw=Object.fromEntries(formData);return memberSchema.safeParse({...raw,gender:raw.gender||null});}
