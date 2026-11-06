// Gate: an AUTHORIZE order Margaret approves with her PayPal account (the app's real bill flow, before approval).
// Records the create response and prints the approval link; approving it needs Margaret's sandbox login.
// Run: node --env-file=.env scripts/sandbox/paypal-order.mjs

import { newRequestId, say, startGate, usd } from "./lib.mjs";

const gate = await startGate("paypal-order");
const r = await gate.post(
  "1-create-authorize-order",
  "/v2/checkout/orders",
  {
    intent: "AUTHORIZE",
    purchase_units: [{ reference_id: "gate", custom_id: "gate", description: "Hollowbrook Electric bill", amount: usd(8400) }],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "Second Look",
          shipping_preference: "NO_SHIPPING",
          user_action: "CONTINUE",
          return_url: "http://localhost:3100/parent/pay/return",
          cancel_url: "http://localhost:3100/parent/pay/cancelled",
        },
      },
    },
  },
  { requestId: newRequestId() },
);
const link = r.body?.links?.find((l) => l.rel === "payer-action" || l.rel === "approve");
say(`order ${r.body?.id} status ${r.body?.status}; approval link rel=${link?.rel}: ${link?.href ?? "none"}`);
