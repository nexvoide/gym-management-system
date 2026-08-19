import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { expenseCategories } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { paymentMethods } from "@/lib/payments";
import { ExpenseForm } from "@/components/expense-form";
import { createExpense } from "../actions";
export default async function Page() { const user = await requirePermission("expenses.write"); const categories = await ((db.select({ id: expenseCategories.id, name: expenseCategories.name }).from(expenseCategories)).where(and(eq(expenseCategories.gymId, user.gymId), eq(expenseCategories.active, true), isNull(expenseCategories.archivedAt)))).orderBy(asc(expenseCategories.name)); return <div className="content content-narrow"><div className="page-head"><div><div className="eyebrow">Operating costs</div><h1>Add expense</h1><p>Record a cost with enough context to understand it later.</p></div></div><ExpenseForm action={createExpense} categories={categories} methods={await paymentMethods(user.gymId)}/></div>; }
