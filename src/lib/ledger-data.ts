// Reads one family's money moves for the ledger. Every query is scoped to the family, which belongs to exactly one
// demo session (hard rule 10). No emails and no secrets are selected: what's read here goes to the browser.
//
// Columns the weekly close added later (who closed it and when, its visits, a payment's share) are read through
// to_jsonb(row), so the ledger works whether or not that migration has run; the week:closed event fills the gaps.

import { db } from "@/lib/db";
import type { Family } from "@/lib/family";
import { memberNamed } from "@/lib/family";
import type { BillRow, CarePeriodRow, EventRow, LedgerInput, PaymentKind, PaymentRow, ShareRow } from "@/lib/ledger";
import { assertCents } from "@/lib/money";
import type { RuleHit } from "@/lib/risk";
import type { PaymentRequestState } from "@/lib/states";

function cents(value: string | number, what: string): number {
  const n = Number(value);
  assertCents(n, what);
  return n;
}

const dateOrNull = (value: string | Date | null): Date | null => (value === null ? null : new Date(value));

export async function getLedgerInput(family: Family): Promise<LedgerInput> {
  const sql = db();
  const [bills, payments, periods, shares, events] = await Promise.all([
    sql<
      {
        id: string;
        payee: string | null;
        amount_cents: string;
        status: PaymentRequestState;
        created_at: Date;
        updated_at: Date;
        decided_by: string | null;
        triggered_rules: RuleHit[];
        hold_expires_at: Date | null;
      }[]
    >`
      select pr.id, p.name as payee, pr.amount_cents, pr.status, pr.created_at, pr.updated_at, m.name as decided_by,
             pr.triggered_rules, pr.hold_expires_at
      from payment_requests pr
      left join payees p on p.id = pr.payee_id
      left join members m on m.id = pr.decided_by_member_id
      where pr.family_id = ${family.id}
      order by pr.created_at`,
    sql<
      {
        id: string;
        kind: PaymentKind;
        payment_request_id: string | null;
        care_period_id: string | null;
        share_id: string | null;
        paypal_order_id: string | null;
        paypal_authorization_id: string | null;
        paypal_capture_id: string | null;
        paypal_payout_batch_id: string | null;
        paypal_invoice_id: string | null;
        paypal_request_id: string;
        order_request_id: string | null;
        amount_cents: string;
        status: string;
        created_at: Date;
      }[]
    >`
      select p.id, p.kind, p.payment_request_id, p.care_period_id, to_jsonb(p)->>'share_id' as share_id,
             p.paypal_order_id, p.paypal_authorization_id, p.paypal_capture_id, p.paypal_payout_batch_id, p.paypal_invoice_id,
             p.paypal_request_id, p.order_request_id, p.amount_cents, p.status, p.created_at
      from payments p
      where p.family_id = ${family.id}
      order by p.created_at`,
    sql<
      {
        id: string;
        start_date: string;
        end_date: string;
        total_cents: string | null;
        status: string;
        payout_sender_batch_id: string | null;
        visits: string | null;
        closed_at: string | null;
        closed_by: string | null;
      }[]
    >`
      select cp.id, cp.start_date::text, cp.end_date::text, cp.total_cents, cp.status, cp.payout_sender_batch_id,
             to_jsonb(cp)->>'visits' as visits, to_jsonb(cp)->>'closed_at' as closed_at, m.name as closed_by
      from care_periods cp
      left join members m on m.family_id = cp.family_id and m.id::text = to_jsonb(cp)->>'closed_by_member_id'
      where cp.family_id = ${family.id} and cp.status <> 'open'`,
    sql<
      {
        id: string;
        care_period_id: string;
        member: string;
        amount_cents: string;
        status: ShareRow["status"];
        invoice_number: string | null;
        paypal_invoice_id: string | null;
      }[]
    >`
      select s.id, s.care_period_id, m.name as member, s.amount_cents, s.status, s.invoice_number, s.paypal_invoice_id
      from shares s
      join care_periods cp on cp.id = s.care_period_id
      join members m on m.id = s.member_id
      where cp.family_id = ${family.id}`,
    sql<{ type: string; payload: Record<string, unknown>; created_at: Date }[]>`
      select type, payload, created_at from events
      where family_id = ${family.id}
        and type in ('request:approved', 'request:denied', 'request:expired', 'week:closed', 'paypal:invoice_sent', 'paypal:invoice_paid')
      order by created_at`,
  ]);

  return {
    aide: memberNamed(family, "aide") ?? "Rosa",
    bills: bills.map(
      (r): BillRow => ({
        id: r.id,
        payee: r.payee ?? "someone new",
        amountCents: cents(r.amount_cents, "bill amount"),
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        decidedBy: r.decided_by,
        rules: r.triggered_rules ?? [],
        holdExpiresAt: r.hold_expires_at,
      }),
    ),
    payments: payments.map(
      (r): PaymentRow => ({
        id: r.id,
        kind: r.kind,
        requestId: r.payment_request_id,
        carePeriodId: r.care_period_id,
        shareId: r.share_id,
        orderId: r.paypal_order_id,
        authorizationId: r.paypal_authorization_id,
        captureId: r.paypal_capture_id,
        payoutBatchId: r.paypal_payout_batch_id,
        invoiceId: r.paypal_invoice_id,
        paypalRequestId: r.paypal_request_id,
        orderRequestId: r.order_request_id,
        amountCents: cents(r.amount_cents, "payment amount"),
        status: r.status,
        createdAt: r.created_at,
      }),
    ),
    periods: periods.map(
      (r): CarePeriodRow => ({
        id: r.id,
        startDate: r.start_date,
        endDate: r.end_date,
        totalCents: r.total_cents === null ? 0 : cents(r.total_cents, "care total"),
        status: r.status,
        visits: r.visits === null ? null : Number(r.visits),
        closedBy: r.closed_by,
        closedAt: dateOrNull(r.closed_at),
        senderBatchId: r.payout_sender_batch_id,
      }),
    ),
    shares: shares.map(
      (r): ShareRow => ({
        id: r.id,
        carePeriodId: r.care_period_id,
        member: r.member,
        amountCents: cents(r.amount_cents, "share"),
        status: r.status,
        invoiceNumber: r.invoice_number,
        invoiceId: r.paypal_invoice_id,
      }),
    ),
    events: events.map((r): EventRow => ({ type: r.type, payload: r.payload ?? {}, at: r.created_at })),
  };
}
