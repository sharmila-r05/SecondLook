// Gate: a card-funded CAPTURE order to Second Look's own account completes at create (no buyer step), topping up the
// balance that Rosa's payouts draw on. Balance read before, then polled to see how long the reporting API lags.
// Run: node --env-file=.env scripts/sandbox/seed-balance.mjs [dollars]   (default 500.00)

import { cardOrder, firstCapture, getBalance, say, sleep, startGate, toCents, verdict } from "./lib.mjs";

const SCRIPT = "seed-balance";
const CENTS = toCents(process.argv[2] ?? "500.00");
const POLL_MS = 10_000;
const POLL_LIMIT_MS = 90_000;

try {
  const gate = await startGate(SCRIPT);
  const before = await getBalance(gate, "0-balance-before");

  const order = await gate.post(
    "1-create-capture-order",
    "/v2/checkout/orders",
    cardOrder({ intent: "CAPTURE", cents: CENTS, description: "Second Look balance top-up (sandbox)", customId: `gate-seed-${Date.now()}` }),
  );
  const cap = firstCapture(order.body);
  const b = cap?.seller_receivable_breakdown;
  say(`  order ${order.body.id ?? "?"} ${order.body.status ?? "?"}; capture ${cap?.id ?? "none"} ${cap?.status ?? ""}; gross ${b?.gross_amount?.value}, fee ${b?.paypal_fee?.value}, net ${b?.net_amount?.value}`);

  const started = Date.now();
  let after = await getBalance(gate, "2-balance-after-0s");
  while ((!after.ok || after.total === before.total) && Date.now() - started < POLL_LIMIT_MS) {
    await sleep(POLL_MS);
    after = await getBalance(gate, `2-balance-after-${Math.round((Date.now() - started) / 1000)}s`);
  }

  say("");
  verdict(order.status === 201 && order.body.status === "COMPLETED" && cap?.status === "COMPLETED", `card CAPTURE order -> HTTP ${order.status} ${order.body.status ?? order.issue}, capture ${cap?.status ?? "none"} (${order.ms} ms)`);
  verdict(after.ok && after.total !== before.total, `balance moved within ${Math.round((Date.now() - started) / 1000)} s: total ${before.total} -> ${after.total}, as_of ${before.asOf} -> ${after.asOf}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
