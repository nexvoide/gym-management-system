import { addDays, differenceInCalendarDays, subDays } from "date-fns";
import { and, desc, eq, gte, gt, lte } from "drizzle-orm";
import { db } from "@/db";
import { gyms, invoices, members, memberships, notificationReads, notifications, payments, settings, type RoleKey } from "@/db/schema";
import { can } from "@/lib/permissions";
export type NotificationType = typeof notifications.$inferSelect.type;
export async function syncNotifications(gymId: string, now = new Date()) {
    const gym = (await (db.select({ currency: gyms.currency, locale: gyms.locale }).from(gyms)).where(eq(gyms.id, gymId)))[0];
    const setting = (await (db.select({ value: settings.value }).from(settings)).where(and(eq(settings.gymId, gymId), eq(settings.key, "expiry_warning_days"))))[0];
    const configured = Array.isArray(setting?.value) ? setting.value.filter((value): value is number => typeof value === "number" && value > 0) : [30, 7, 1];
    const warningDays = Math.max(...configured, 7);
    const money = new Intl.NumberFormat(gym?.locale ?? "en", { style: "currency", currency: gym?.currency ?? "USD", maximumFractionDigits: 0 });
    const add = async (row: typeof notifications.$inferInsert) => await (db.insert(notifications).values(row)).onConflictDoNothing();
    const expiring = await ((db.select({ id: memberships.id, memberId: members.id, firstName: members.firstName, lastName: members.lastName, number: members.memberNumber, endsAt: memberships.endsAt }).from(memberships)).innerJoin(members, eq(memberships.memberId, members.id))).where(and(eq(memberships.gymId, gymId), eq(memberships.status, "active"), gte(memberships.endsAt, now), lte(memberships.endsAt, addDays(now, warningDays))));
    for (const row of expiring) {
        const days = Math.max(0, differenceInCalendarDays(row.endsAt, now));
        await add({ id: crypto.randomUUID(), gymId, type: "membership_expiring", title: "Membership expiring", body: `${row.firstName} ${row.lastName} (${row.number}) expires in ${days} day${days === 1 ? "" : "s"}.`, entityType: "member", entityId: row.memberId, href: `/members/${row.memberId}?tab=membership`, channel: "in_app", dedupeKey: `membership_expiring:${row.id}:${row.endsAt.toISOString().slice(0, 10)}`, occurredAt: now });
    }
    const expired = await ((db.select({ id: memberships.id, memberId: members.id, firstName: members.firstName, lastName: members.lastName, number: members.memberNumber, endsAt: memberships.endsAt }).from(memberships)).innerJoin(members, eq(memberships.memberId, members.id))).where(and(eq(memberships.gymId, gymId), lte(memberships.endsAt, now), gte(memberships.endsAt, subDays(now, 30))));
    for (const row of expired)
        await add({ id: crypto.randomUUID(), gymId, type: "membership_expired", title: "Membership expired", body: `${row.firstName} ${row.lastName} (${row.number}) has an expired membership.`, entityType: "member", entityId: row.memberId, href: `/members/${row.memberId}?tab=membership`, channel: "in_app", dedupeKey: `membership_expired:${row.id}:${row.endsAt.toISOString().slice(0, 10)}`, occurredAt: row.endsAt });
    const overdue = await ((db.select({ id: invoices.id, memberId: members.id, invoiceNumber: invoices.invoiceNumber, balance: invoices.balance, firstName: members.firstName, lastName: members.lastName, dueAt: invoices.dueAt }).from(invoices)).innerJoin(members, eq(invoices.memberId, members.id))).where(and(eq(invoices.gymId, gymId), gt(invoices.balance, 0), lte(invoices.dueAt, now)));
    for (const row of overdue)
        await add({ id: crypto.randomUUID(), gymId, type: "payment_overdue", title: "Payment overdue", body: `${row.firstName} ${row.lastName} owes ${money.format(row.balance)} on ${row.invoiceNumber}.`, entityType: "invoice", entityId: row.id, href: `/payments/invoices/${row.id}`, channel: "in_app", dedupeKey: `payment_overdue:${row.id}`, occurredAt: row.dueAt });
    const received = await ((db.select({ id: payments.id, invoiceId: payments.invoiceId, amount: payments.amount, paidAt: payments.paidAt, firstName: members.firstName, lastName: members.lastName }).from(payments)).innerJoin(members, eq(payments.memberId, members.id))).where(and(eq(payments.gymId, gymId), gte(payments.paidAt, subDays(now, 30)), lte(payments.paidAt, now)));
    for (const row of received)
        await add({ id: crypto.randomUUID(), gymId, type: "payment_received", title: "Payment received", body: `${money.format(row.amount)} received from ${row.firstName} ${row.lastName}.`, entityType: "invoice", entityId: row.invoiceId, href: `/payments/invoices/${row.invoiceId}`, channel: "in_app", dedupeKey: `payment_received:${row.id}`, occurredAt: row.paidAt });
}
export function visibleNotificationTypes(role: RoleKey): NotificationType[] {
    const types: NotificationType[] = [];
    if (can(role, "memberships.read"))
        types.push("membership_expiring", "membership_expired");
    if (can(role, "payments.read"))
        types.push("payment_overdue", "payment_received");
    return types;
}
export async function notificationFeed(gymId: string, userId: string, role: RoleKey, limit = 100) {
    const allowed = new Set(visibleNotificationTypes(role));
    return (await db.select({ id: notifications.id, type: notifications.type, title: notifications.title, body: notifications.body, href: notifications.href, occurredAt: notifications.occurredAt, readAt: notificationReads.readAt }).from(notifications).leftJoin(notificationReads, and(eq(notificationReads.notificationId, notifications.id), eq(notificationReads.userId, userId))).where(eq(notifications.gymId, gymId)).orderBy(desc(notifications.occurredAt)).limit(limit)).filter(row => allowed.has(row.type));
}
export async function unreadNotificationCount(gymId: string, userId: string, role: RoleKey) {
    return (await notificationFeed(gymId, userId, role)).filter(row => !row.readAt).length;
}
export async function markNotificationRead(notificationId: string, userId: string) {
    await (db.insert(notificationReads).values({ notificationId, userId })).onConflictDoNothing();
}
