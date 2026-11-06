// Margaret's bills through PayPal, pass-through (decided 6 Nov): she approves an AUTHORIZE order to Second Look; the
// hold is captured at once for a normal bill, or waits for family when the rules asked for a second look. Captured
// money reaches the payee by Payouts. Every PayPal POST has a payments row whose request id is stored before the
// call, so a retry replays the same id and PayPal dedupes; each step below is safe to run again.

import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { db } from "@/lib/db";
import { SANDBOX_EMAILS } from "@/lib/demo/accounts";
import { recordEvent } from "@/lib/events";
import type { Family } from "@/lib/family";
import { assertCents } from "@/lib/money";
import { authorizeOrder, captureAuthorization, createAuthorizeOrder, createPayout, getPayout, voidAuthorization } from "@/lib/paypal";
import type { RuleHit } from "@/lib/risk";
import { type PaymentRequestState, transition } from "@/lib/states";

type Sql = postgres.Sql | postgres.TransactionSql;

export interface BillRequest {
  id: string;
  status: PaymentRequestState;
  amountCents: number;
  payeeName: string;
  payeeEmail: string | null;
  payeeKnown: boolean;
  rules: RuleHit[];
}

async function loadRequest(sql: Sql, family: Pick<Family, "id">, requestId: string): Promise<BillRequest> {
  const [row] = await sql<
    { id: string; status: PaymentRequestState; amount_cents: string; payee: string; email: string | null; known: boolean; rules: RuleHit[] }[]
  >`
    select pr.id, pr.status, pr.amount_cents, p.name as payee, p.paypal_email as email, p.known, pr.triggered_rules as rules
    from payment_requests pr join payees p on p.id = pr.payee_id
    where pr.id = ${requestId} and pr.family_id = ${family.id}`;
  if (!row) throw new Error("no such payment request in this family");
  const amountCents = Number(row.amount_cents);
  assertCents(amountCents);
  return { id: row.id, status: row.status, amountCents, payeeName: row.payee, payeeEmail: row.email, payeeKnown: row.known, rules: row.rules };
}

/** Moves a request between states through the one state machine; false when another writer got there first. */
export async function moveRequest(
  sql: Sql,
  requestId: string,
  from: PaymentRequestState,
  to: PaymentRequestState,
  extra: { decidedBy?: string; holdMinutes?: number; riskNote?: string } = {},
): Promise<boolean> {
  transition(from, to);
  const moved = await sql`
    update payment_requests set
      status = ${to},
      updated_at = now(),
      decided_by_member_id = coalesce(${extra.decidedBy ?? null}::uuid, decided_by_member_id),
      hold_expires_at = case when ${extra.holdMinutes ?? null}::int is null then hold_expires_at
                             else now() + make_interval(mins => ${extra.holdMinutes ?? 0}::int) end,
      risk_note = coalesce(${extra.riskNote ?? null}, risk_note)
    where id = ${requestId} and status = ${from}
    returning id`;
  return moved.length > 0;
}

interface PaymentRow {
  id: string;
  paypal_request_id: string;
  order_request_id: string | null;
  paypal_order_id: string | null;
  paypal_authorization_id: string | null;
  paypal_capture_id: string | null;
  paypal_payout_batch_id: string | null;
  status: string;
}

async function paymentRow(sql: Sql, requestId: string, kind: string): Promise<PaymentRow | undefined> {
  const [row] = await sql<PaymentRow[]>`
    select id, paypal_request_id, order_request_id, paypal_order_id, paypal_authorization_id, paypal_capture_id,
           paypal_payout_batch_id, status
    from payments where payment_request_id = ${requestId} and kind = ${kind}
    order by created_at limit 1`;
  return row;
}

/** Step 1, after "Yes, pay it": the AUTHORIZE order Margaret approves on PayPal. Returns where to send her. */
export async function startBill(family: Pick<Family, "id">, sessionId: string, requestId: string, origin: string): Promise<string> {
  const sql = db();
  const bill = await loadRequest(sql, family, requestId);
  let row = await paymentRow(sql, requestId, "authorization");
  if (!row) {
    // Both request ids are stored before either call (hard rule 4).
    [row] = await sql<PaymentRow[]>`
      insert into payments (demo_session_id, family_id, payment_request_id, kind, paypal_request_id, order_request_id, amount_cents, status)
      values (${sessionId}, ${family.id}, ${requestId}, 'authorization', ${randomUUID()}, ${randomUUID()}, ${bill.amountCents}, 'creating')
      returning id, paypal_request_id, order_request_id, paypal_order_id, paypal_authorization_id, paypal_capture_id, paypal_payout_batch_id, status`;
  }
  if (!row?.order_request_id) throw new Error("authorization row has no order request id");

  const order = await createAuthorizeOrder({
    requestId: row.order_request_id,
    amountCents: bill.amountCents,
    description: `${bill.payeeName}, paid by Margaret through Second Look`,
    customId: requestId,
    returnUrl: `${origin}/parent/pay/return`,
    cancelUrl: `${origin}/parent/pay/cancelled?request=${requestId}`,
  });
  await sql`update payments set paypal_order_id = ${order.orderId}, status = ${order.status} where id = ${row.id}`;
  return order.approveUrl;
}

/**
 * Step 2, back from PayPal: authorize (the hold), then let the rules' decision stand. A normal bill is captured and
 * paid out now; a payment the rules flagged stays held for family. Safe to call again for the same order.
 */
export async function finishApproval(
  family: Pick<Family, "id">,
  sessionId: string,
  orderId: string,
  holdMinutes: number,
  riskNote: (bill: BillRequest) => Promise<string>,
): Promise<BillRequest> {
  const sql = db();
  const [found] = await sql<{ request_id: string }[]>`
    select payment_request_id as request_id from payments
    where paypal_order_id = ${orderId} and family_id = ${family.id} and kind = 'authorization'`;
  if (!found) throw new Error("that PayPal order isn't one of this family's bills");
  const requestId = found.request_id;
  const row = await paymentRow(sql, requestId, "authorization");
  if (!row) throw new Error("authorization row missing");

  if (!row.paypal_authorization_id) {
    const hold = await authorizeOrder({ orderId, requestId: row.paypal_request_id });
    await sql`update payments set paypal_authorization_id = ${hold.authorizationId}, status = ${hold.status} where id = ${row.id}`;
    await recordEvent(sql, family, sessionId, "paypal:authorized", { requestId, authorizationId: hold.authorizationId, expiresAt: hold.expiresAt ?? null });
  }

  const bill = await loadRequest(sql, family, requestId);
  if (bill.status === "new") {
    if (bill.rules.length === 0) {
      if (await moveRequest(sql, requestId, "new", "approved_auto")) {
        await recordEvent(sql, family, sessionId, "request:approved_auto", { requestId, payee: bill.payeeName, amountCents: bill.amountCents });
      }
    } else {
      const note = await riskNote(bill);
      if (await moveRequest(sql, requestId, "new", "held", { holdMinutes, riskNote: note })) {
        await recordEvent(sql, family, sessionId, "request:held", { requestId, payee: bill.payeeName, amountCents: bill.amountCents, note });
      }
    }
  }

  const after = await loadRequest(sql, family, requestId);
  if (after.status === "approved_auto") await captureAndPay(family, sessionId, after);
  return loadRequest(sql, family, requestId);
}

/**
 * Takes the held money and pays the payee. Hard rule 1: only from approved_auto or approved_by_family, and the
 * payout only after a COMPLETED capture. Hard rule 3: the payee is known, or family approved this payment.
 */
export async function captureAndPay(family: Pick<Family, "id">, sessionId: string, bill: BillRequest): Promise<void> {
  if (bill.status !== "approved_auto" && bill.status !== "approved_by_family") throw new Error(`can't capture a ${bill.status} request`);
  if (bill.status === "approved_auto" && !bill.payeeKnown) throw new Error("an unknown payee needs a family member's approval");
  const sql = db();
  const hold = await paymentRow(sql, bill.id, "authorization");
  if (!hold?.paypal_authorization_id) throw new Error("no authorization to capture");

  let capture = await paymentRow(sql, bill.id, "capture");
  if (!capture) {
    [capture] = await sql<PaymentRow[]>`
      insert into payments (demo_session_id, family_id, payment_request_id, kind, paypal_request_id, paypal_authorization_id, amount_cents, status)
      values (${sessionId}, ${family.id}, ${bill.id}, 'capture', ${randomUUID()}, ${hold.paypal_authorization_id}, ${bill.amountCents}, 'capturing')
      returning id, paypal_request_id, order_request_id, paypal_order_id, paypal_authorization_id, paypal_capture_id, paypal_payout_batch_id, status`;
  }
  if (!capture) throw new Error("capture row missing");
  if (capture.status !== "COMPLETED") {
    const taken = await captureAuthorization({ authorizationId: hold.paypal_authorization_id, requestId: capture.paypal_request_id, invoiceId: `sl-${bill.id}` });
    await sql`update payments set paypal_capture_id = ${taken.captureId}, status = ${taken.status} where id = ${capture.id}`;
    if (taken.status !== "COMPLETED") return; // PENDING: the webhook or the next look finishes it
    await sql`update payments set status = 'CAPTURED' where id = ${hold.id}`; // the authorization row follows the hold
    await recordEvent(sql, family, sessionId, "paypal:captured", { requestId: bill.id, captureId: taken.captureId, amountCents: bill.amountCents });
  }

  let payout = await paymentRow(sql, bill.id, "payout");
  if (!payout) {
    [payout] = await sql<PaymentRow[]>`
      insert into payments (demo_session_id, family_id, payment_request_id, kind, paypal_request_id, amount_cents, status)
      values (${sessionId}, ${family.id}, ${bill.id}, 'payout', ${randomUUID()}, ${bill.amountCents}, 'paying')
      returning id, paypal_request_id, order_request_id, paypal_order_id, paypal_authorization_id, paypal_capture_id, paypal_payout_batch_id, status`;
  }
  if (!payout) throw new Error("payout row missing");
  if (!payout.paypal_payout_batch_id) {
    // In the sandbox a payee Margaret named for the first time has no PayPal account on file; the demo's stand-in
    // account receives it. A real product would ask family for the payee's PayPal email when approving.
    const receiver = bill.payeeEmail ?? SANDBOX_EMAILS.techSupport;
    const sent = await createPayout({
      senderBatchId: `sl-bill-${bill.id}`,
      requestId: payout.paypal_request_id,
      receiverEmail: receiver,
      amountCents: bill.amountCents,
      note: `Payment from Margaret, through Second Look`,
      senderItemId: bill.id,
      emailSubject: `A payment from Margaret`,
    });
    await sql`update payments set paypal_payout_batch_id = ${sent.payoutBatchId}, status = ${sent.batchStatus} where id = ${payout.id}`;
    await recordEvent(sql, family, sessionId, "paypal:payout", { requestId: bill.id, payoutBatchId: sent.payoutBatchId, payee: bill.payeeName, amountCents: bill.amountCents });
  }

  const from = bill.status;
  if (await moveRequest(sql, bill.id, from, "paid")) {
    await recordEvent(sql, family, sessionId, "request:paid", { requestId: bill.id, payee: bill.payeeName, amountCents: bill.amountCents });
  }
}

/** Releases a hold: the money never left. From denied or expired; PREVIOUSLY_VOIDED counts as done. */
export async function releaseHold(family: Pick<Family, "id">, sessionId: string, bill: BillRequest): Promise<void> {
  if (bill.status !== "denied" && bill.status !== "expired") throw new Error(`can't void a ${bill.status} request`);
  const sql = db();
  const hold = await paymentRow(sql, bill.id, "authorization");
  if (hold?.paypal_authorization_id) {
    let row = await paymentRow(sql, bill.id, "void");
    if (!row) {
      [row] = await sql<PaymentRow[]>`
        insert into payments (demo_session_id, family_id, payment_request_id, kind, paypal_request_id, paypal_authorization_id, amount_cents, status)
        values (${sessionId}, ${family.id}, ${bill.id}, 'void', ${randomUUID()}, ${hold.paypal_authorization_id}, ${bill.amountCents}, 'voiding')
        returning id, paypal_request_id, order_request_id, paypal_order_id, paypal_authorization_id, paypal_capture_id, paypal_payout_batch_id, status`;
    }
    if (!row) throw new Error("void row missing");
    if (row.status !== "VOIDED") {
      const released = await voidAuthorization({ authorizationId: hold.paypal_authorization_id, requestId: row.paypal_request_id });
      await sql`update payments set status = ${released.status} where id = ${row.id}`;
      await sql`update payments set status = 'VOIDED' where id = ${hold.id}`;
      await recordEvent(sql, family, sessionId, "paypal:voided", { requestId: bill.id, authorizationId: hold.paypal_authorization_id, amountCents: bill.amountCents });
    }
  }
  await moveRequest(sql, bill.id, bill.status, "voided");
}

/** Margaret backed out on PayPal's page: nothing was authorized, so the request simply goes away. */
export async function abandonBill(family: Pick<Family, "id">, requestId: string): Promise<void> {
  await db().begin(async (tx) => {
    const [row] = await tx<{ status: string }[]>`select status from payment_requests where id = ${requestId} and family_id = ${family.id}`;
    if (row?.status !== "new") return;
    const authorized = await tx`select 1 from payments where payment_request_id = ${requestId} and paypal_authorization_id is not null`;
    if (authorized.length > 0) return;
    await tx`delete from payments where payment_request_id = ${requestId}`;
    await tx`delete from payment_requests where id = ${requestId}`;
  });
}

/**
 * The hold timeout, swept lazily whenever the family's screens load (no scheduler, correct even after the server
 * slept): a held request nobody answered in time expires and its hold is voided. Also retries any denied or expired
 * request whose void didn't finish.
 */
export async function sweepExpiredHolds(family: Pick<Family, "id">, sessionId: string): Promise<void> {
  const sql = db();
  const due = await sql<{ id: string }[]>`
    select id from payment_requests
    where family_id = ${family.id} and status = 'held' and hold_expires_at < now()`;
  for (const { id } of due) {
    if (await moveRequest(sql, id, "held", "expired")) await recordEvent(sql, family, sessionId, "request:expired", { requestId: id });
  }
  // Orders Margaret never approved or cancelled (closed the tab on PayPal's page): nothing was authorized.
  const abandoned = await sql<{ id: string }[]>`
    select id from payment_requests
    where family_id = ${family.id} and status = 'new' and created_at < now() - interval '30 minutes'`;
  for (const { id } of abandoned) await abandonBill(family, id);

  // Payouts finish a few seconds after we send them; read back any still in flight (webhooks do this once deployed).
  const inFlight = await sql<{ id: string; batch: string }[]>`
    select id, paypal_payout_batch_id as batch from payments
    where family_id = ${family.id} and kind = 'payout' and paypal_payout_batch_id is not null
      and status in ('PENDING', 'PROCESSING')`;
  for (const { id, batch } of inFlight) {
    try {
      const latest = await getPayout(batch);
      if (latest.batchStatus !== "UNKNOWN") await sql`update payments set status = ${latest.batchStatus} where id = ${id}`;
    } catch (err) {
      console.error("reading a payout failed; the next look retries:", err instanceof Error ? err.message : err);
    }
  }

  // A family approval whose capture or payout didn't finish (PayPal hiccup): finish it now.
  const approved = await sql<{ id: string }[]>`
    select id from payment_requests where family_id = ${family.id} and status in ('approved_by_family', 'approved_auto')
      and updated_at < now() - interval '15 seconds'`;
  for (const { id } of approved) {
    try {
      await captureAndPay(family, sessionId, await loadRequest(sql, family, id));
    } catch (err) {
      console.error("finishing an approved payment failed; the next look retries:", err instanceof Error ? err.message : err);
    }
  }

  const unreleased = await sql<{ id: string }[]>`
    select id from payment_requests where family_id = ${family.id} and status in ('denied', 'expired')`;
  for (const { id } of unreleased) {
    try {
      await releaseHold(family, sessionId, await loadRequest(sql, family, id));
    } catch (err) {
      console.error("releasing a hold failed; the next look retries:", err instanceof Error ? err.message : err);
    }
  }
}

export { loadRequest };
