// Keeps Second Look's sandbox balance able to pay. Rosa's weekly pay leaves the balance before (or without) the
// siblings paying their invoices, so over weeks of demos it can run dry. When PayPal refuses a payout for
// INSUFFICIENT_FUNDS, top up from PayPal's sandbox test card and retry once. Measured 9 Nov: the refused payout leaves
// its sender_batch_id unused, so the retry keeps it (no double pay) under a new, stored PayPal-Request-Id.

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { createPayout, PayPalError, topUpSandboxBalance } from "@/lib/paypal";

type PayoutInput = Parameters<typeof createPayout>[0];

export const TOP_UP_CENTS = 200_000;

export function topUpAmount(payoutCents: number): number {
  return Math.max(TOP_UP_CENTS, Math.ceil((payoutCents + 50_000) / 10_000) * 10_000);
}

async function topUp(payoutCents: number): Promise<void> {
  const sql = db();
  const amountCents = topUpAmount(payoutCents);
  const requestId = randomUUID();
  const [row] = await sql<{ id: string }[]>`
    insert into balance_topups (paypal_request_id, amount_cents, status) values (${requestId}, ${amountCents}, 'topping-up') returning id`;
  const result = await topUpSandboxBalance({ requestId, amountCents });
  await sql`update balance_topups set paypal_order_id = ${result.orderId}, status = ${result.status} where id = ${row!.id}`;
  console.log(`sandbox balance topped up by ${amountCents} cents: order ${result.orderId} ${result.status}`);
}

/**
 * createPayout for the payments row `paymentRowId`, topping up and retrying once on INSUFFICIENT_FUNDS. The retry's
 * request id is written to the row before the call (hard rule 4).
 */
export async function payoutWithTopUp(paymentRowId: string, input: PayoutInput): ReturnType<typeof createPayout> {
  try {
    return await createPayout(input);
  } catch (err) {
    if (!(err instanceof PayPalError) || err.issue !== "INSUFFICIENT_FUNDS") throw err;
    console.warn(`payout refused for insufficient funds (debug_id ${err.debugId}); topping up the sandbox balance`);
    await topUp(input.amountCents);
    const retryRequestId = randomUUID();
    await db()`update payments set paypal_request_id = ${retryRequestId} where id = ${paymentRowId}`;
    return createPayout({ ...input, requestId: retryRequestId });
  }
}
