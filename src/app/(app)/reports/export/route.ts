import { format } from "date-fns";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { attendance, expenseCategories, expenses, members, membershipHistory, membershipPlans, memberships, payments } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { customRange, toCsv } from "@/lib/reports";
export async function GET(request: NextRequest) {
    const user = await requirePermission("reports.read");
    const report = request.nextUrl.searchParams.get("report") ?? "members";
    const range = customRange(request.nextUrl.searchParams.get("from") ?? undefined, request.nextUrl.searchParams.get("to") ?? undefined);
    let csv: string;
    if (report === "attendance") {
        const rows = await (((db.select({ date: attendance.localDate, memberId: members.memberNumber, firstName: members.firstName, lastName: members.lastName, checkIn: attendance.checkInAt, checkOut: attendance.checkOutAt, method: attendance.method }).from(attendance)).innerJoin(members, eq(attendance.memberId, members.id))).where(and(eq(attendance.gymId, user.gymId), gte(attendance.checkInAt, range.from), lte(attendance.checkInAt, range.to)))).orderBy(asc(attendance.checkInAt));
        csv = toCsv(["Date", "Member ID", "Member", "Check in", "Check out", "Method"], rows.map(row => [row.date, row.memberId, `${row.firstName} ${row.lastName}`, row.checkIn, row.checkOut, row.method]));
    }
    else if (report === "financial") {
        const revenue = (await db.select({ date: payments.paidAt, description: members.memberNumber, category: payments.method, amount: payments.amount }).from(payments).innerJoin(members, eq(payments.memberId, members.id)).where(and(eq(payments.gymId, user.gymId), gte(payments.paidAt, range.from), lte(payments.paidAt, range.to)))).map(row => [row.date, "Revenue", row.description, row.category, row.amount]);
        const costs = (await db.select({ date: expenses.expenseDate, description: expenses.description, category: expenseCategories.name, amount: expenses.amount }).from(expenses).innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id)).where(and(eq(expenses.gymId, user.gymId), gte(expenses.expenseDate, range.from), lte(expenses.expenseDate, range.to)))).map(row => [row.date, "Expense", row.description, row.category, -row.amount]);
        csv = toCsv(["Date", "Type", "Description", "Method / category", "Net amount"], [...revenue, ...costs].sort((a, b) => new Date(a[0] as Date).getTime() - new Date(b[0] as Date).getTime()));
    }
    else if (report === "memberships") {
        const rows = await (((((db.select({ date: membershipHistory.createdAt, action: membershipHistory.action, memberId: members.memberNumber, firstName: members.firstName, lastName: members.lastName, plan: membershipPlans.name, status: membershipHistory.toStatus }).from(membershipHistory)).innerJoin(members, eq(membershipHistory.memberId, members.id))).innerJoin(memberships, eq(membershipHistory.membershipId, memberships.id))).innerJoin(membershipPlans, eq(memberships.planId, membershipPlans.id))).where(and(eq(membershipHistory.gymId, user.gymId), gte(membershipHistory.createdAt, range.from), lte(membershipHistory.createdAt, range.to)))).orderBy(asc(membershipHistory.createdAt));
        csv = toCsv(["Date", "Action", "Member ID", "Member", "Plan", "Status"], rows.map(row => [row.date, row.action, row.memberId, `${row.firstName} ${row.lastName}`, row.plan, row.status]));
    }
    else {
        const rows = await ((db.select({ joined: members.createdAt, memberId: members.memberNumber, firstName: members.firstName, lastName: members.lastName, phone: members.phone, email: members.email, status: members.status }).from(members)).where(and(eq(members.gymId, user.gymId), gte(members.createdAt, range.from), lte(members.createdAt, range.to)))).orderBy(asc(members.createdAt));
        csv = toCsv(["Joined", "Member ID", "First name", "Last name", "Phone", "Email", "Account status"], rows.map(row => [row.joined, row.memberId, row.firstName, row.lastName, row.phone, row.email, row.status]));
    }
    const filename = `${report}-report-${format(range.from, "yyyy-MM-dd")}-${format(range.to, "yyyy-MM-dd")}.csv`;
    return new Response(`\uFEFF${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` } });
}
