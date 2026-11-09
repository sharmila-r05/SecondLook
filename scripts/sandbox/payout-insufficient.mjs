// Gate: what a payout refused for INSUFFICIENT_FUNDS leaves behind. A payout far over the balance, then the SAME
// sender_batch_id again for a small amount with a new PayPal-Request-Id (as an automatic top-up-and-retry would).
// Then a card-funded CAPTURE order to Second Look's own account (the top-up itself).
// Run: node --env-file=.env scripts/sandbox/payout-insufficient.mjs
import { ACCOUNTS, cardOrder, firstCapture, newRequestId, say, startGate, verdict } from "./lib.mjs";

const gate = await startGate("payout-insufficient");
const batchId = `sl-gate-${Date.now()}-nsf`;
const payout = (cents) => ({
  sender_batch_header: { sender_batch_id: batchId, email_subject: "Gate test" },
  items: [{ recipient_type: "EMAIL", amount: { value: (cents / 100).toFixed(2), currency: "USD" }, receiver: ACCOUNTS.rosa, note: "Gate test", sender_item_id: "nsf-1" }],
});
say(`  sender_batch_id ${batchId}`);
const big = await gate.post("1-payout-over-balance", "/v1/payments/payouts", payout(9_000_000), { requestId: newRequestId(), prefer: null });
const again = await gate.post("2-same-batch-small-new-request-id", "/v1/payments/payouts", payout(100), { requestId: newRequestId(), prefer: null });
const topUp = await gate.post("3-card-capture-top-up", "/v2/checkout/orders", cardOrder({ intent: "CAPTURE", cents: 200000, description: "Second Look sandbox balance top-up", customId: "gate-top-up" }), { requestId: newRequestId() });
const cap = firstCapture(topUp.body);
say(`  top-up order ${topUp.body.id ?? "?"} ${topUp.body.status ?? topUp.issue}; capture ${cap?.id ?? "?"} ${cap?.status ?? ""}`);
verdict(big.status === 422, `over-balance payout -> HTTP ${big.status} ${big.issue ?? big.body?.name ?? ""}`);
verdict(true, `same sender_batch_id afterwards -> HTTP ${again.status} ${again.body?.batch_header?.batch_status ?? again.issue ?? again.body?.name ?? ""}`);
verdict(topUp.status === 201 && cap?.status === "COMPLETED", `card top-up -> HTTP ${topUp.status} ${cap?.status ?? ""}`);
