// PayPal webhooks: a second way news arrives besides reading PayPal back on each page load. Handlers only record what
// PayPal says happened; none of them moves money (a held payment is never captured here).

import { markInvoicePaid } from "@/lib/care";
import { db } from "@/lib/db";

export interface WebhookEvent {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    invoice?: { id?: string; status?: string };
    batch_header?: { payout_batch_id?: string; batch_status?: string };
  };
}

export const WEBHOOK_EVENT_TYPES = [
  "CHECKOUT.ORDER.APPROVED",
  "PAYMENT.AUTHORIZATION.CREATED",
  "PAYMENT.AUTHORIZATION.VOIDED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.PENDING",
  "PAYMENT.CAPTURE.DECLINED",
  "PAYMENT.PAYOUTSBATCH.SUCCESS",
  "PAYMENT.PAYOUTSBATCH.DENIED",
  "INVOICING.INVOICE.PAID",
] as const;

/** Applies one verified event. Returns a short word for the log (never the body). */
export async function handleWebhook(event: WebhookEvent): Promise<string> {
  const sql = db();
  const r = event.resource ?? {};
  switch (event.event_type) {
    case "INVOICING.INVOICE.PAID": {
      const invoiceId = r.invoice?.id ?? r.id;
      if (!invoiceId) return "no invoice id";
      return (await markInvoicePaid(invoiceId, r.invoice?.status ?? r.status ?? "PAID")) ? "share paid" : "already known";
    }
    case "PAYMENT.PAYOUTSBATCH.SUCCESS":
    case "PAYMENT.PAYOUTSBATCH.DENIED": {
      const batchId = r.batch_header?.payout_batch_id;
      const status = r.batch_header?.batch_status;
      if (!batchId || !status) return "no batch";
      const rows = await sql`update payments set status = ${status} where kind = 'payout' and paypal_payout_batch_id = ${batchId} returning id`;
      return rows.length ? `payout ${status}` : "unknown batch";
    }
    case "PAYMENT.CAPTURE.COMPLETED":
    case "PAYMENT.CAPTURE.PENDING":
    case "PAYMENT.CAPTURE.DECLINED": {
      if (!r.id || !r.status) return "no capture";
      const rows = await sql`update payments set status = ${r.status} where kind = 'capture' and paypal_capture_id = ${r.id} returning id`;
      return rows.length ? `capture ${r.status}` : "unknown capture";
    }
    case "PAYMENT.AUTHORIZATION.VOIDED": {
      if (!r.id) return "no authorization";
      const rows = await sql`update payments set status = 'VOIDED' where kind = 'authorization' and paypal_authorization_id = ${r.id} returning id`;
      return rows.length ? "authorization voided" : "unknown authorization";
    }
    default:
      return "noted";
  }
}
