"use server";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, expenseCategories, expenses } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { paymentMethods, roundMoney } from "@/lib/payments";
export type ExpenseState = {
    error?: string;
};
const optional = (max: number) => z.string().trim().max(max).optional().transform(v => v || null);
const schema = z.object({ categoryId: z.string().min(1), description: z.string().trim().min(2).max(200), amount: z.coerce.number().finite().positive(), expenseDate: z.string().min(1).transform(v => new Date(`${v}T12:00:00`)), paymentMethod: z.string().min(1), vendor: optional(100), receiptUrl: z.union([z.literal(""), z.url()]).optional().transform(v => v || null), notes: optional(500) });
export async function createCategory(_: ExpenseState, data: FormData): Promise<ExpenseState> {
    const user = await requirePermission("expenses.write");
    const parsed = z.object({ name: z.string().trim().min(2).max(60) }).safeParse(Object.fromEntries(data));
    if (!parsed.success)
        return { error: "Enter a category name." };
    try {
        await db.transaction(async (tx) => { const id = crypto.randomUUID(); await tx.insert(expenseCategories).values({ id, gymId: user.gymId, name: parsed.data.name }); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "expense_category.created", entityType: "expense_category", entityId: id }); });
    }
    catch {
        return { error: "This category already exists." };
    }
    revalidatePath("/expenses");
    return {};
}
async function saveExpense(id: string | null, _: ExpenseState, data: FormData): Promise<ExpenseState> {
    const user = await requirePermission("expenses.write");
    const parsed = schema.safeParse(Object.fromEntries(data));
    if (!parsed.success)
        return { error: "Correct the expense details." };
    const category = (await (db.select().from(expenseCategories)).where(and(eq(expenseCategories.id, parsed.data.categoryId), eq(expenseCategories.gymId, user.gymId), eq(expenseCategories.active, true), isNull(expenseCategories.archivedAt))))[0];
    if (!category)
        return { error: "Expense category not found." };
    if (!(await paymentMethods(user.gymId)).includes(parsed.data.paymentMethod))
        return { error: "This payment method is not enabled." };
    const expenseId = id ?? crypto.randomUUID(), values = { ...parsed.data, amount: roundMoney(parsed.data.amount) };
    await db.transaction(async (tx) => {
        if (id)
            await (tx.update(expenses).set({ ...values, updatedAt: new Date() })).where(and(eq(expenses.id, id), eq(expenses.gymId, user.gymId)));
        else
            await tx.insert(expenses).values({ id: expenseId, gymId: user.gymId, createdBy: user.id, ...values });
        await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: id ? "expense.updated" : "expense.created", entityType: "expense", entityId: expenseId, metadata: { amount: values.amount } });
    });
    redirect("/expenses");
}
export async function createExpense(state: ExpenseState, data: FormData) { return await saveExpense(null, state, data); }
export async function updateExpense(id: string, state: ExpenseState, data: FormData) { return await saveExpense(id, state, data); }
