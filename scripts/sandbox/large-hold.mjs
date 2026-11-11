// Gate: can Margaret's saved PayPal (a Vault v3 payment token) be held for a large amount, the kind a "bail for
// your grandson" scam asks for? For each amount: an AUTHORIZE order with payment_source.paypal.vault_id, then a void
// straight away, so no sandbox money stays held.
//
// Run: node --env-file=.env scripts/sandbox/large-hold.mjs [cents …]   (default 1500000 2500000 6000000)
// With DEMO_PARENT_VAULT_ID set (never printed) the holds use Margaret's saved PayPal; without it, PayPal's published
// test card. Answers are saved, emails redacted, under tmp/sandbox-runs/large-hold/.

import { TEST_CARD, firstAuthorization, newRequestId, say, startGate, usd, verdict } from "./lib.mjs";

const vaultId = process.env.DEMO_PARENT_VAULT_ID;
const source = vaultId ? { paypal: { vault_id: vaultId } } : TEST_CARD;
say(`funding: ${vaultId ? "Margaret's saved PayPal (vault)" : "the sandbox test card"}`);
const amounts = process.argv.slice(2).map(Number).filter((n) => n > 0);
const gate = await startGate("large-hold");

for (const cents of amounts.length ? amounts : [1_500_000, 2_500_000, 6_000_000]) {
  const label = `gate-large-${cents}`;
  const created = await gate.post(`order-${cents}`, "/v2/checkout/orders", {
    intent: "AUTHORIZE",
    purchase_units: [{ reference_id: label, custom_id: label, description: "Large hold gate, voided at once", amount: usd(cents) }],
    payment_source: source,
  }, { requestId: newRequestId() });
  const hold = firstAuthorization(created.body);
  say(`$${(cents / 100).toLocaleString("en-US")}: HTTP ${created.status}, order ${created.body?.status ?? created.issue ?? "?"}, authorization ${hold?.status ?? "none"}`);
  verdict(hold?.status === "CREATED", `a $${(cents / 100).toLocaleString("en-US")} hold is placed with no buyer step`);
  if (hold?.id) {
    const voided = await gate.post(`void-${cents}`, `/v2/payments/authorizations/${hold.id}/void`, undefined, { requestId: newRequestId() });
    verdict(voided.status < 300, `and voids (${voided.body?.status ?? voided.status})`);
  }
}
