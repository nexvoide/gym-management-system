import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { invoiceDetail, paymentMethods } from "@/lib/payments";
import { PaymentForm } from "@/components/payment-form";
import { recordPayment } from "../../../actions";
export default async function Page({ params }: {
    params: Promise<{
        id: string;
    }>;
}) { const user = await requirePermission("payments.write"); const { id } = await params; const invoice = await invoiceDetail(user.gymId, id); if (!invoice)
    notFound(); if (invoice.balance <= 0)
    redirect(`/payments/invoices/${id}`); return <div className="content content-narrow"><div className="page-head"><div><div className="eyebrow">{invoice.invoiceNumber}</div><h1>Record payment</h1><p>Receive payment from {invoice.memberName}.</p></div></div><PaymentForm action={recordPayment.bind(null, id)} invoiceId={id} balance={invoice.balance} currency={invoice.currency} locale={invoice.locale} methods={await paymentMethods(user.gymId)}/></div>; }
