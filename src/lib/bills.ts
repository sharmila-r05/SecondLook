// Margaret's bills through PayPal, pass-through (decided 6 Nov): an AUTHORIZE order to Second Look places a hold;
// the hold is captured at once for a normal bill, or waits for family when the rules asked for a second look.
// Captured money reaches the payee by Payouts. With her PayPal connected once (src/lib/vault.ts) the order names her
// saved PayPal and the hold comes back at create; otherwise she approves each order on PayPal's page. Every PayPal
// POST has a payments row whose request id is stored before the call, so a retry replays the same id and PayPal
// dedupes; each step below is safe to run again.

import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { db } from "@/lib/db";
import { SANDBOX_EMAILS } from "@/lib/demo/accounts";
import { recordEvent } from "@/lib/events";
import type { Family } from "@/lib/family";
import { assertCents } from "@/lib/money";
import { templateNote } from "@/lib/note";
import {
  authorizeOrder,
  captureAuthorization,
  createAuthorizeOrder,
  createPayout,
  getPayout,
  PayPalError,
  voidAuthorization,
} from "@/lib/paypal";
import { createVaultedAuthorizeOrder } from "@/lib/paypal-vault";
import type { RuleHit } from "@/lib/risk";
import { type PaymentRequestState, transition } from "@/lib/states";
import { forgetSavedPayPal, savedPayPal } from "@/lib/vault";

type Sql = postgres.Sql | postgres.TransactionSql;

const HOLD_MINUTES = Number(process.env.HOLD_TIMEOUT_MINUTES ?? 10) || 10;

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

/** Where a bill goes after "Yes, pay it": to PayPal's page for her approval, or straight on to the decision. */
export type BillStart =
  | { kind: "paypal"; approveUrl: string }
  /** Her saved PayPal placed the hold with no PayPal page: settle the bill now (settleBill). */
  | { kind: "held"; requestId: string };

/** For logs: PayPal's issue and debug_id, never a body or an email. */
function explain(err: unknown): string {
  if (err instanceof PayPalError) return `${err.status} ${err.issue} (debug_id ${err.debugId ?? "none"})`;
  return err instanceof Error ? err.message : String(err);
}

/**
 * Step 1, after "Yes, pay it": the AUTHORIZE order. With her PayPal connected, the order names the saved PayPal and
 * the hold comes back at once; if that doesn't work, or she hasn't connected, she approves the order on PayPal.
 */
export async function startBill(family: Pick<Family, "id">, sessionId: string, requestId: string, origin: string): Promise<BillStart> {
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
  if (row.paypal_authorization_id) return { kind: "held", requestId };

  const vaultId = row.paypal_order_id ? null : await savedPayPal(family);
  if (vaultId) {
    const started = await holdFromSavedPayPal(family, sessionId, bill, row, vaultId);
    if (started) return started;
    row = await paymentRow(sql, requestId, "authorization");
    if (!row?.order_request_id) throw new Error("authorization row has no order request id");
  }

  const order = await createAuthorizeOrder({
    requestId: row.order_request_id,
    amountCents: bill.amountCents,
    description: `${bill.payeeName}, paid by Margaret through Second Look`,
    customId: requestId,
    returnUrl: `${origin}/parent/pay/return`,
    cancelUrl: `${origin}/parent/pay/cancelled?request=${requestId}`,
  });
  await sql`update payments set paypal_order_id = ${order.orderId}, status = ${order.status} where id = ${row.id}`;
  return { kind: "paypal", approveUrl: order.approveUrl };
}

/**
 * The order from her saved PayPal. Null when it gave no hold: the row then has a fresh order request id (stored
 * before the next call), and the caller falls back to PayPal's page. A vault id PayPal refuses is forgotten, so she
 * is asked to connect again.
 */
async function holdFromSavedPayPal(
  family: Pick<Family, "id">,
  sessionId: string,
  bill: BillRequest,
  row: PaymentRow,
  vaultId: string,
): Promise<BillStart | null> {
  const sql = db();
  try {
    const order = await createVaultedAuthorizeOrder({
      requestId: row.order_request_id ?? "",
      vaultId,
      amountCents: bill.amountCents,
      description: `${bill.payeeName}, paid by Margaret through Second Look`,
      customId: bill.id,
    });
    await sql`update payments set paypal_order_id = ${order.orderId}, status = ${order.status} where id = ${row.id}`;
    // Expected: the hold at create. An APPROVED order is authorized here, still with no PayPal page for her.
    const hold = order.authorization ?? (order.status === "APPROVED" ? await authorizeOrder({ orderId: order.orderId, requestId: row.paypal_request_id }) : undefined);
    if (hold?.status === "CREATED") {
      await sql`update payments set paypal_authorization_id = ${hold.authorizationId}, status = ${hold.status} where id = ${row.id}`;
      await recordEvent(sql, family, sessionId, "paypal:authorized", {
        requestId: bill.id,
        authorizationId: hold.authorizationId,
        expiresAt: hold.expiresAt ?? null,
        savedPayPal: true,
      });
      return { kind: "held", requestId: bill.id };
    }
    // PayPal wants her after all: this order's own page, which comes back through /parent/pay/return.
    if (order.status === "PAYER_ACTION_REQUIRED" && order.approveUrl) return { kind: "paypal", approveUrl: order.approveUrl };
    console.error(`the saved PayPal gave order ${order.status}, hold ${hold?.status ?? "none"} (debug_id ${order.debugId ?? "none"}); asking PayPal instead`);
  } catch (err) {
    console.error("paying from the saved PayPal failed; asking PayPal instead:", explain(err));
    if (err instanceof PayPalError && err.status === 403) await forgetSavedPayPal(family, vaultId);
  }
  await sql`update payments set order_request_id = ${randomUUID()}, paypal_order_id = null, status = 'creating' where id = ${row.id}`;
  return null;
}

/**
 * Step 2, back from PayPal: authorize (the hold), then let the rules' decision stand (settleBill). Safe to call
 * again for the same order.
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
  return settleBill(family, sessionId, requestId, holdMinutes, riskNote);
}

/**
 * Once the hold is placed, by either path: a normal bill is captured and paid out now; a payment the rules flagged
 * stays held for family (hard rule 1). Safe to call again.
 */
export async function settleBill(
  family: Pick<Family, "id">,
  sessionId: string,
  requestId: string,
  holdMinutes: number,
  riskNote: (bill: BillRequest) => Promise<string>,
): Promise<BillRequest> {
  const sql = db();
  const row = await paymentRow(sql, requestId, "authorization");
  if (!row?.paypal_authorization_id) throw new Error("no hold placed for this bill");

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
  // A hold placed but never decided (the decision step failed after PayPal authorized): decide it now, so Margaret's
  // money isn't left held with no one asked. A minute's grace leaves the normal path time to finish first.
  const undecided = await sql<{ id: string }[]>`
    select pr.id from payment_requests pr
    where pr.family_id = ${family.id} and pr.status = 'new' and pr.created_at < now() - interval '1 minute'
      and exists (select 1 from payments p where p.payment_request_id = pr.id and p.kind = 'authorization' and p.paypal_authorization_id is not null)`;
  for (const { id } of undecided) {
    try {
      await settleBill(family, sessionId, id, HOLD_MINUTES, async (bill) => templateNote(bill));
    } catch (err) {
      console.error("deciding a placed hold failed; the next look retries:", err instanceof Error ? err.message : err);
    }
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

/**
 * Holds that ran out in demo families nobody is looking at any more: expire and void a few on every page load, so
 * abandoned sessions never keep Margaret's sandbox money held until PayPal's own 29-day expiry.
 */
export async function sweepOtherExpiredHolds(limit = 5): Promise<void> {
  const sql = db();
  const due = await sql<{ id: string; family_id: string; demo_session_id: string; status: PaymentRequestState }[]>`
    select id, family_id, demo_session_id, status from payment_requests
    where (status = 'held' and hold_expires_at < now() - interval '1 minute') or status in ('denied', 'expired')
    order by updated_at limit ${limit}`;
  for (const row of due) {
    const family = { id: row.family_id };
    try {
      if (row.status === "held" && (await moveRequest(sql, row.id, "held", "expired"))) {
        await recordEvent(sql, family, row.demo_session_id, "request:expired", { requestId: row.id });
      }
      await releaseHold(family, row.demo_session_id, await loadRequest(sql, family, row.id));
    } catch (err) {
      console.error("releasing another family's expired hold failed; a later look retries:", err instanceof Error ? err.message : err);
    }
  }
}

export { loadRequest };
