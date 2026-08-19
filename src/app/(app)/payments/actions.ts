"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, invoices, payments } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { paymentMethods, paymentState, roundMoney } from "@/lib/payments";
export type PaymentState = {
    error?: string;
};
const schema = z.object({ amount: z.coerce.number().finite().positive(), method: z.string().min(1).max(50), paidAt: z.string().min(1).transform(value => new Date(`${value}T12:00:00`)), reference: z.string().trim().max(100).optional().transform(value => value || null), notes: z.string().trim().max(500).optional().transform(value => value || null) });
export async function recordPayment(invoiceId: string, _: PaymentState, data: FormData): Promise<PaymentState> {
    const user = await requirePermission("payments.write");
    const parsed = schema.safeParse(Object.fromEntries(data));
    if (!parsed.success)
        return { error: "Enter a valid payment amount, method, and date." };
    if (!(await paymentMethods(user.gymId)).includes(parsed.data.method))
        return { error: "This payment method is not enabled." };
    const invoice = (await (db.select().from(invoices)).where(and(eq(invoices.id, invoiceId), eq(invoices.gymId, user.gymId))))[0];
    if (!invoice)
        return { error: "Invoice not found." };
    const amount = roundMoney(parsed.data.amount);
    if (invoice.status === "refunded")
        return { error: "Payments cannot be added to a refunded invoice." };
    if (amount > invoice.balance)
        return { error: `Payment cannot exceed the outstanding balance of ${invoice.balance}.` };
    const next = paymentState(invoice.total, roundMoney(invoice.paid + amount), invoice.dueAt);
    const id = crypto.randomUUID();
    await db.transaction(async (tx) => { await tx.insert(payments).values({ id, gymId: user.gymId, memberId: invoice.memberId, invoiceId, amount, method: parsed.data.method, paidAt: parsed.data.paidAt, reference: parsed.data.reference, notes: parsed.data.notes, recordedBy: user.id }); await (tx.update(invoices).set({ paid: next.paid, balance: next.balance, status: next.status, updatedAt: new Date() })).where(eq(invoices.id, invoiceId)); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "payment.recorded", entityType: "member", entityId: invoice.memberId, metadata: { paymentId: id, invoiceId, amount } }); });
    revalidatePath("/payments");
    revalidatePath(`/payments/invoices/${invoiceId}`);
    revalidatePath(`/members/${invoice.memberId}`);
    redirect(`/payments/invoices/${invoiceId}`);
}
