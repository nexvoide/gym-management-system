import { and, asc, count, desc, eq, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { members } from "@/db/schema";
import type { MemberStatus } from "./member-status";
export type { MemberStatus } from "./member-status";
export const memberStatusSql = sql<string> `case
  when ${members.status} = 'frozen' then 'frozen' when ${members.status} = 'cancelled' then 'cancelled'
  when (select ms.status from memberships ms where ms.member_id = ${sql.raw("members.id")} order by ms.ends_at desc limit 1) = 'frozen' then 'frozen'
  when (select ms.status from memberships ms where ms.member_id = ${sql.raw("members.id")} order by ms.ends_at desc limit 1) = 'cancelled' then 'cancelled'
  when (select max(ms.ends_at) from memberships ms where ms.member_id = ${sql.raw("members.id")}) is null then 'expired'
  when (select max(ms.ends_at) from memberships ms where ms.member_id = ${sql.raw("members.id")}) < now() then 'expired'
  when (select max(ms.ends_at) from memberships ms where ms.member_id = ${sql.raw("members.id")}) <= now() + interval '7 days' then 'expiring_soon'
  else 'active' end`;
export async function listMembers(gymId: string, params: {
    q?: string;
    status?: string;
    sort?: string;
    page?: number;
    trainerId?: string;
}) {
    const page = Math.max(1, params.page ?? 1), pageSize = 10, q = params.q?.trim();
    const filters: SQL[] = [eq(members.gymId, gymId), isNull(members.archivedAt)];
    if (q) {
        const term = `%${q}%`;
        filters.push(or(like(members.firstName, term), like(members.lastName, term), like(sql `${members.firstName} || ' ' || ${members.lastName}`, term), like(members.phone, term), like(members.email, term), like(members.memberNumber, term))!);
    }
    if (params.status && ["active", "expiring_soon", "expired", "frozen", "cancelled"].includes(params.status))
        filters.push(sql `${memberStatusSql} = ${params.status}`);
    if (params.trainerId)
        filters.push(eq(members.trainerId, params.trainerId));
    const where = and(...filters);
    const total = (await (db.select({ value: count() }).from(members)).where(where))[0]?.value ?? 0;
    const currentEnd = sql<Date | null> `(select max(ms.ends_at) from memberships ms where ms.member_id = ${sql.raw("members.id")})`.mapWith(members.createdAt);
    const planName = sql<string | null> `(select mp.name from memberships ms join membership_plans mp on mp.id=ms.plan_id where ms.member_id=${sql.raw("members.id")} order by ms.ends_at desc limit 1)`;
    const sort = params.sort ?? "newest";
    const ordering = sort === "name" ? asc(members.firstName) : sort === "expiry" ? asc(currentEnd) : sort === "oldest" ? asc(members.createdAt) : desc(members.createdAt);
    const rows = await ((((db.select({ id: members.id, memberNumber: members.memberNumber, firstName: members.firstName, lastName: members.lastName, profilePhotoUrl: members.profilePhotoUrl, phone: members.phone, email: members.email, status: memberStatusSql, membership: planName, expiry: currentEnd, trainerName: sql<string | null> `(select t.name from trainers t where t.id=${members.trainerId})`, createdAt: members.createdAt }).from(members)).where(where)).orderBy(ordering)).limit(pageSize)).offset((page - 1) * pageSize);
    return { rows: rows as (typeof rows[number] & {
            status: MemberStatus;
        })[], total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
export async function getMember(gymId: string, id: string) {
    return (await (db.select({ id: members.id, memberNumber: members.memberNumber, firstName: members.firstName, lastName: members.lastName, profilePhotoUrl: members.profilePhotoUrl, dateOfBirth: members.dateOfBirth, gender: members.gender, phone: members.phone, email: members.email, emailNotificationsEnabled:members.emailNotificationsEnabled, whatsappNotificationsEnabled:members.whatsappNotificationsEnabled, address: members.address, notes: members.notes, emergencyContactName: members.emergencyContactName, emergencyContactRelationship: members.emergencyContactRelationship, emergencyContactPhone: members.emergencyContactPhone, trainerId: members.trainerId, trainerName: sql<string | null> `(select t.name from trainers t where t.id=${members.trainerId})`, accountStatus: members.status, status: memberStatusSql, membershipId: sql<string | null> `(select ms.id from memberships ms where ms.member_id=${sql.raw("members.id")} order by ms.ends_at desc limit 1)`, membership: sql<string | null> `(select mp.name from memberships ms join membership_plans mp on mp.id=ms.plan_id where ms.member_id=${sql.raw("members.id")} order by ms.ends_at desc limit 1)`, membershipPrice: sql<number | null> `(select mp.price::double precision from memberships ms join membership_plans mp on mp.id=ms.plan_id where ms.member_id=${sql.raw("members.id")} order by ms.ends_at desc limit 1)`, membershipStart: sql<Date | null> `(select ms.starts_at from memberships ms where ms.member_id=${sql.raw("members.id")} order by ms.ends_at desc limit 1)`.mapWith(members.createdAt), membershipEnd: sql<Date | null> `(select ms.ends_at from memberships ms where ms.member_id=${sql.raw("members.id")} order by ms.ends_at desc limit 1)`.mapWith(members.createdAt), createdAt: members.createdAt, updatedAt: members.updatedAt }).from(members)).where(and(eq(members.gymId, gymId), eq(members.id, id), isNull(members.archivedAt))))[0];
}
