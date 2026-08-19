import { addDays, startOfMonth } from "date-fns";
import { and, asc, desc, eq, gte, isNull, like, sql, type SQL } from "drizzle-orm";
import { CircleDollarSign, Plus, ReceiptText, Store, Tags } from "lucide-react";
import Link from "next/link";
import { ExpenseCategoryForm } from "@/components/expense-category-form";
import { db } from "@/db";
import { expenseCategories, expenses, gyms, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
type Props = {
    searchParams: Promise<{
        tab?: string;
        category?: string;
        q?: string;
    }>;
};
export default async function Page({ searchParams }: Props) {
    const user = await requirePermission("expenses.read");
    const params = await searchParams;
    const tab = params.tab ?? "expenses";
    const gym = (await (db.select({ currency: gyms.currency }).from(gyms)).where(eq(gyms.id, user.gymId)))[0];
    const money = new Intl.NumberFormat("en-PK", { style: "currency", currency: gym?.currency ?? "PKR", maximumFractionDigits: 0 });
    const categories = await ((((db.select({
        id: expenseCategories.id,
        name: expenseCategories.name,
        total: sql<number> `coalesce(sum(${expenses.amount}), 0)::double precision`,
    }).from(expenseCategories)).leftJoin(expenses, eq(expenses.categoryId, expenseCategories.id))).where(and(eq(expenseCategories.gymId, user.gymId), isNull(expenseCategories.archivedAt)))).groupBy(expenseCategories.id)).orderBy(asc(expenseCategories.name));
    const now = new Date();
    const monthStart = startOfMonth(now);
    const weekStart = addDays(now, -6);
    const summary = (await (db.select({
        all: sql<number> `coalesce(sum(${expenses.amount}), 0)::double precision`,
        month: sql<number> `coalesce(sum(case when ${gte(expenses.expenseDate, monthStart)} then ${expenses.amount} else 0 end), 0)::double precision`,
        week: sql<number> `coalesce(sum(case when ${gte(expenses.expenseDate, weekStart)} then ${expenses.amount} else 0 end), 0)::double precision`,
    }).from(expenses)).where(eq(expenses.gymId, user.gymId)))[0]!;
    const filters: SQL[] = [eq(expenses.gymId, user.gymId)];
    if (params.category)
        filters.push(eq(expenses.categoryId, params.category));
    if (params.q)
        filters.push(like(expenses.description, `%${params.q}%`));
    const rows = tab === "expenses" ? await (((((db.select({
        id: expenses.id,
        description: expenses.description,
        amount: expenses.amount,
        expenseDate: expenses.expenseDate,
        paymentMethod: expenses.paymentMethod,
        vendor: expenses.vendor,
        receiptUrl: expenses.receiptUrl,
        category: expenseCategories.name,
        createdBy: users.name,
    }).from(expenses)).innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))).innerJoin(users, eq(expenses.createdBy, users.id))).where(and(...filters))).orderBy(desc(expenses.expenseDate))).limit(100) : [];
    return <div className="content">
    <div className="page-head"><div><div className="eyebrow">Operating costs</div><h1>Expenses</h1><p>Track where money goes without turning this into accounting software.</p></div>{can(user.role, "expenses.write") && tab === "expenses" && <Link className="btn btn-primary" href="/expenses/new"><Plus size={16}/> Add expense</Link>}</div>
    <section className="expense-stats"><ExpenseStat icon={CircleDollarSign} label="This month" value={money.format(summary.month)}/><ExpenseStat icon={ReceiptText} label="Last 7 days" value={money.format(summary.week)}/><ExpenseStat icon={Store} label="All-time expenses" value={money.format(summary.all)}/><ExpenseStat icon={Tags} label="Categories" value={String(categories.length)}/></section>
    <nav className="profile-tabs membership-tabs"><Link className={tab === "expenses" ? "active" : ""} href="/expenses">Expenses</Link><Link className={tab === "categories" ? "active" : ""} href="/expenses?tab=categories">Categories</Link></nav>
    {tab === "categories" ? <section className="card categories-card">{can(user.role, "expenses.write") && <ExpenseCategoryForm />}<div className="category-list">{categories.map(category => <div key={category.id}><span>{category.name}</span><strong>{category.total ? money.format(category.total) : "No expenses"}</strong></div>)}</div></section> : <section className="card table-card">
      <form className="table-toolbar"><div className="table-search"><input name="q" defaultValue={params.q ?? ""} placeholder="Search expense descriptions"/></div><div className="filter-group"><select name="category" defaultValue={params.category ?? ""}><option value="">All categories</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select><button className="btn btn-secondary btn-sm">Apply</button></div></form>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Vendor</th><th>Method</th><th>Receipt</th><th>Amount</th><th /></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.expenseDate.toLocaleDateString("en-PK")}</td><td><strong>{row.description}</strong><small className="table-sub">Recorded by {row.createdBy}</small></td><td><span className="category-pill">{row.category}</span></td><td>{row.vendor ?? "—"}</td><td>{row.paymentMethod}</td><td>{row.receiptUrl ? <a className="link" href={row.receiptUrl} target="_blank" rel="noreferrer">View</a> : "—"}</td><td><strong>{money.format(row.amount)}</strong></td><td>{can(user.role, "expenses.write") && <Link className="row-action" href={`/expenses/${row.id}/edit`}>Edit</Link>}</td></tr>)}</tbody></table>{!rows.length && <div className="empty-inline">No expenses match these filters.</div>}</div>
    </section>}
  </div>;
}
function ExpenseStat({ icon: Icon, label, value }: {
    icon: typeof ReceiptText;
    label: string;
    value: string;
}) {
    return <article className="card expense-stat"><span><Icon size={18}/></span><div><strong>{value}</strong><small>{label}</small></div></article>;
}
