import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { syncNotifications, unreadNotificationCount } from "@/lib/notifications";
import { acquireLease } from "@/lib/rate-limit";
import { db } from "@/db";
import { gyms } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signedGymLogoUrl } from "@/lib/gym-branding";
import { processExpiryReminders } from "@/lib/member-communication-service";
export default async function ProtectedLayout({ children }: {
    children: React.ReactNode;
}) { const user = await requireUser(); if (await acquireLease("notifications:sync", user.gymId, 5 * 60 * 1000)) await syncNotifications(user.gymId); if (await acquireLease("communications:expiry", user.gymId, 60 * 60 * 1000)) await processExpiryReminders(user.gymId); const unreadNotifications = await unreadNotificationCount(user.gymId, user.id, user.role);const gym=(await db.select({skin:gyms.skin,name:gyms.name,logoUrl:gyms.logoUrl}).from(gyms).where(eq(gyms.id,user.gymId)))[0]; const logoUrl=await signedGymLogoUrl(gym?.logoUrl??null,user.gymId); return <div data-skin={gym?.skin??"midnight"}><AppShell user={user} unreadNotifications={unreadNotifications} gym={{name:gym?.name??"Form",logoUrl}}>{children}</AppShell></div>; }
