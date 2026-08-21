"use server";
import { revalidatePath } from "next/cache";
import { requireMemberAccess, requirePermission } from "@/lib/auth";
import { sendMemberExpiryEmail, sendMemberWelcomeEmail } from "@/lib/member-communication-service";

export async function sendWelcomeEmail(memberId: string) {
  const user = await requireMemberAccess(memberId); const result = await sendMemberWelcomeEmail(user.gymId, memberId, user.id);
  if (!result.sent && result.reason === "delivery_failed") throw new Error("The welcome email could not be delivered.");
  revalidatePath(`/members/${memberId}`);
}
export async function sendExpiryEmail(memberId: string) {
  const user = await requirePermission("memberships.write"); await requireMemberAccess(memberId);
  const result = await sendMemberExpiryEmail(user.gymId, memberId, user.id);
  if (!result.sent && result.reason === "delivery_failed") throw new Error("The expiry email could not be delivered.");
  revalidatePath(`/members/${memberId}`);
}
