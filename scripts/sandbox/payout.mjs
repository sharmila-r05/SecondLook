// Gate: Payouts from Second Look's balance. $150.00 to Rosa with a fixed sender_batch_id, polled to a final status;
// the same sender_batch_id replayed (same and new PayPal-Request-Id); a $90,000.00 payout (over the balance and the
// $20,000 per-item limit); a payout just over the balance but under $20,000. Balance before and after.
// Run: node --env-file=.env scripts/sandbox/payout.mjs [over-balance dollars]

import { ACCOUNTS, getBalance, newRequestId, say, sleep, startGate, toCents, toValue, verdict } from "./lib.mjs";

const SCRIPT = "payout";
const FINAL = new Set(["SUCCESS", "DENIED", "CANCELED"]);
const ITEM_LIMIT_CENTS = 2_000_000;

function payoutBody(senderBatchId, cents, note) {
  return {
    sender_batch_header: {
      sender_batch_id: senderBatchId,
      email_subject: "Your pay from Second Look",
      email_message: "Thank you for caring for Margaret this week.",
    },
    items: [
      {
        recipient_type: "EMAIL",
        amount: { value: toValue(cents), currency: "USD" },
        receiver: ACCOUNTS.rosa,
        sender_item_id: `${senderBatchId}-rosa`,
        note,
      },
    ],
  };
}

// Poll the batch every 3 s until it is final or the time runs out; print and save only when the status changes.
async function pollBatch(gate, label, batchId, limitMs) {
  const started = Date.now();
  let last = "";
  let r;
  for (let n = 1; ; n++) {
    r = await gate.get(`${label}-poll`, `/v1/payments/payouts/${batchId}`, { quiet: true, save: false });
    const item = r.body.items?.[0];
    const now = `${r.body.batch_header?.batch_status ?? r.issue}/${item?.transaction_status ?? "-"}`;
    const secs = Math.round((Date.now() - started) / 1000);
    if (now !== last) {
      await gate.get(`${label}-poll-${String(n).padStart(2, "0")}-${secs}s`, `/v1/payments/payouts/${batchId}`, { quiet: true });
      say(`  ${secs}s: batch ${r.body.batch_header?.batch_status ?? r.status} item ${item?.transaction_status ?? "-"}${item?.errors?.name ? ` error ${item.errors.name}` : ""} (item ${item?.payout_item_id ?? "-"}, transaction ${item?.transaction_id ?? "-"}; debug_id ${r.debugId ?? "none"})`);
      last = now;
    }
    if (FINAL.has(r.body.batch_header?.batch_status) || Date.now() - started > limitMs) break;
    await sleep(3000);
  }
  return { r, secs: Math.round((Date.now() - started) / 1000) };
}

try {
  const gate = await startGate(SCRIPT);
  const before = await getBalance(gate, "0-balance-before");

  const batchId = `sl-gate-${Date.now()}`;
  const body = payoutBody(batchId, 15000, "Care for Margaret, week of Nov 2 (gate test)");
  const rid = newRequestId();
  say(`  sender_batch_id ${batchId}`);
  const p1 = await gate.post("1-create-payout-150", "/v1/payments/payouts", body, { requestId: rid, prefer: null });
  const payoutBatchId = p1.body.batch_header?.payout_batch_id;
  say(`  payout_batch_id ${payoutBatchId ?? "none"}, batch_status ${p1.body.batch_header?.batch_status ?? p1.issue}`);

  let poll;
  if (payoutBatchId) poll = await pollBatch(gate, "2", payoutBatchId, 120_000);

  const sameRid = await gate.post("3-replay-same-batch-id-same-request-id", "/v1/payments/payouts", body, { requestId: rid, prefer: null });
  const newRid = await gate.post("4-replay-same-batch-id-new-request-id", "/v1/payments/payouts", body, { prefer: null });
  for (const [name, r] of [["same request id", sameRid], ["new request id", newRid]]) {
    say(`  replay (${name}): payout_batch_id ${r.body.batch_header?.payout_batch_id ?? "-"}${r.body.batch_header?.payout_batch_id === payoutBatchId ? " (same batch)" : ""}`);
  }

  const mid = await getBalance(gate, "5-balance-after-150");
  const huge = await gate.post("6-payout-90000", "/v1/payments/payouts", payoutBody(`sl-gate-${Date.now()}-big`, 9_000_000, "Gate test: over balance and item limit"), { prefer: null });
  let hugePoll;
  if (huge.body.batch_header?.payout_batch_id) hugePoll = await pollBatch(gate, "6", huge.body.batch_header.payout_batch_id, 60_000);

  // "Just over the balance": the reported balance lags, so default to reported available + $1,000 (override by argument).
  const reported = mid.ok ? toCents(mid.available) : toCents(before.available ?? "0");
  const overCents = process.argv[2] ? toCents(process.argv[2]) : Math.min(reported + 100_000, ITEM_LIMIT_CENTS - 100);
  say(`  over-balance payout: ${toValue(overCents)} (reported available ${toValue(reported)})`);
  const over = await gate.post("7-payout-over-balance", "/v1/payments/payouts", payoutBody(`sl-gate-${Date.now()}-over`, overCents, "Gate test: just over the balance"), { prefer: null });
  let overPoll;
  if (over.body.batch_header?.payout_batch_id) overPoll = await pollBatch(gate, "7", over.body.batch_header.payout_batch_id, 60_000);

  const after = await getBalance(gate, "8-balance-after");

  say("");
  verdict(p1.status === 201 && Boolean(payoutBatchId), `payout create -> HTTP ${p1.status} ${p1.body.batch_header?.batch_status ?? p1.issue} (${p1.ms} ms)`);
  verdict(poll?.r.body.batch_header?.batch_status === "SUCCESS", `batch ${poll?.r.body.batch_header?.batch_status ?? "-"}, item ${poll?.r.body.items?.[0]?.transaction_status ?? "-"} after ${poll?.secs ?? "-"} s`);
  say(`INFO  same sender_batch_id + same request id -> HTTP ${sameRid.status} ${sameRid.body.batch_header?.batch_status ?? sameRid.issue ?? ""}`);
  say(`INFO  same sender_batch_id + new request id -> HTTP ${newRid.status} ${newRid.body.batch_header?.batch_status ?? newRid.issue ?? ""}`);
  say(`INFO  $90,000.00 -> HTTP ${huge.status} ${huge.body.batch_header?.batch_status ?? huge.issue ?? ""}${hugePoll ? `, then ${hugePoll.r.body.batch_header?.batch_status}/${hugePoll.r.body.items?.[0]?.transaction_status}` : ""}`);
  say(`INFO  $${toValue(overCents)} -> HTTP ${over.status} ${over.body.batch_header?.batch_status ?? over.issue ?? ""}${overPoll ? `, then ${overPoll.r.body.batch_header?.batch_status}/${overPoll.r.body.items?.[0]?.transaction_status}` : ""}`);
  say(`INFO  balance total ${before.total} -> ${mid.total} -> ${after.total}; as_of ${before.asOf} -> ${after.asOf}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
