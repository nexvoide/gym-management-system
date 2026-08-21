"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, invoices, payments } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { paymentMethods, paymentState } from "@/lib/payments";
import { minorToAmount, moneyToMinor } from "@/lib/membership";
export type PaymentState = {
    error?: string;
};
const schema = z.object({ amount: z.string().regex(/^\d+(?:\.\d{1,3})?$/), method: z.string().min(1).max(50), paidAt: z.string().min(1).transform(value => new Date(`${value}T12:00:00.000Z`)), reference: z.string().trim().max(100).optional().transform(value => value || null), notes: z.string().trim().max(500).optional().transform(value => value || null) });
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
    let amountMinor: bigint; try { amountMinor = moneyToMinor(parsed.data.amount, invoice.currency); } catch (error) { return { error: error instanceof Error ? error.message : "Enter a valid payment amount." }; }
    if (amountMinor <= 0n) return { error: "Payment amount must be greater than zero." };
    if (invoice.status === "refunded")
        return { error: "Payments cannot be added to a refunded invoice." };
    if (amountMinor > moneyToMinor(invoice.balance, invoice.currency))
        return { error: `Payment cannot exceed the outstanding balance of ${invoice.balance}.` };
    const amount = minorToAmount(amountMinor, invoice.currency), nextPaid = minorToAmount(moneyToMinor(invoice.paid, invoice.currency) + amountMinor, invoice.currency);
    const next = paymentState(invoice.total, nextPaid, invoice.dueAt, new Date(), invoice.currency);
    const id = crypto.randomUUID();
    await db.transaction(async (tx) => { await tx.insert(payments).values({ id, gymId: user.gymId, memberId: invoice.memberId, invoiceId, currency: invoice.currency, amount, method: parsed.data.method, paidAt: parsed.data.paidAt, reference: parsed.data.reference, notes: parsed.data.notes, recordedBy: user.id }); await (tx.update(invoices).set({ paid: next.paid, balance: next.balance, status: next.status, updatedAt: new Date() })).where(and(eq(invoices.id, invoiceId),eq(invoices.gymId,user.gymId))); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), gymId: user.gymId, userId: user.id, action: "payment.recorded", entityType: "member", entityId: invoice.memberId, metadata: { paymentId: id, invoiceId, amount, currency: invoice.currency } }); });
    revalidatePath("/payments");
    revalidatePath(`/payments/invoices/${invoiceId}`);
    revalidatePath(`/members/${invoice.memberId}`);
    redirect(`/payments/invoices/${invoiceId}`);
}
