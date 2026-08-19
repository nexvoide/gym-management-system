import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { expenseCategories, expenses } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { paymentMethods } from "@/lib/payments";
import { ExpenseForm } from "@/components/expense-form";
import { updateExpense } from "../../actions";
export default async function Page({ params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const user = await requirePermission("expenses.write");
    const { id } = await params;
    const expense = (await (db.select().from(expenses)).where(and(eq(expenses.id, id), eq(expenses.gymId, user.gymId))))[0];
    if (!expense)
        notFound();
    const categories = await ((db.select({ id: expenseCategories.id, name: expenseCategories.name }).from(expenseCategories)).where(and(eq(expenseCategories.gymId, user.gymId), isNull(expenseCategories.archivedAt)))).orderBy(asc(expenseCategories.name));
    return <div className="content content-narrow"><div className="page-head"><div><div className="eyebrow">Operating costs</div><h1>Edit expense</h1><p>Correct the supporting details without deleting financial history.</p></div></div><ExpenseForm action={updateExpense.bind(null, id)} categories={categories} methods={await paymentMethods(user.gymId)} values={expense}/></div>;
}
