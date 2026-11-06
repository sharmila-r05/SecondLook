// Gate: a $1,500.00 card hold is voided (deny = the money never left); a capture after the void and a second void are
// refused; a void replayed with the same PayPal-Request-Id; a captured $10.00 hold can't be voided.
// Run: node --env-file=.env scripts/sandbox/card-hold-void.mjs

import { cardOrder, firstAuthorization, newRequestId, say, startGate, usd, verdict } from "./lib.mjs";

const SCRIPT = "card-hold-void";

async function hold(gate, step, cents, description, tag) {
  const created = await gate.post(step, "/v2/checkout/orders", cardOrder({ intent: "AUTHORIZE", cents, description, customId: tag }));
  const auth = firstAuthorization(created.body);
  say(`  order ${created.body.id ?? "?"} ${created.body.status ?? "?"}; authorization ${auth?.id ?? "none"} ${auth?.status ?? ""}`);
  if (!auth) process.exit(1);
  return auth;
}

try {
  const gate = await startGate(SCRIPT);
  const tag = `gate-void-${Date.now()}`;

  // A: the held scam-like payment, denied.
  const a = await hold(gate, "a1-create-order-1500", 150000, "Microsoft support (gate test)", `${tag}-a`);
  const voidRid = newRequestId();
  const void1 = await gate.post("a2-void", `/v2/payments/authorizations/${a.id}/void`, undefined, { requestId: voidRid });
  const voidReplay = await gate.post("a3-void-replay-same-request-id", `/v2/payments/authorizations/${a.id}/void`, undefined, { requestId: voidRid });
  const capAfterVoid = await gate.post("a4-capture-after-void", `/v2/payments/authorizations/${a.id}/capture`, {
    amount: usd(150000),
    final_capture: true,
    invoice_id: `${tag}-a`,
  });
  const void2 = await gate.post("a5-void-again-new-request-id", `/v2/payments/authorizations/${a.id}/void`, undefined);
  const aRead = await gate.get("a6-read-authorization", `/v2/payments/authorizations/${a.id}`);

  // B: a small hold that is captured, then someone tries to void it.
  const b = await hold(gate, "b1-create-order-10", 1000, "Pharmacy (gate test)", `${tag}-b`);
  const bCap = await gate.post("b2-capture", `/v2/payments/authorizations/${b.id}/capture`, {
    amount: usd(1000),
    final_capture: true,
    invoice_id: `${tag}-b`,
  });
  const bVoid = await gate.post("b3-void-after-capture", `/v2/payments/authorizations/${b.id}/void`, undefined);
  const bRead = await gate.get("b4-read-authorization", `/v2/payments/authorizations/${b.id}`);

  say("");
  verdict([200, 204].includes(void1.status) && (void1.status === 204 || void1.body.status === "VOIDED"), `void -> HTTP ${void1.status} ${void1.body.status ?? ""} (${void1.ms} ms)`);
  say(`INFO  void replayed with the same request id -> HTTP ${voidReplay.status} ${voidReplay.body.status ?? voidReplay.issue ?? ""}`);
  verdict(capAfterVoid.status === 422 && capAfterVoid.issue === "AUTHORIZATION_VOIDED", `capture after void -> ${capAfterVoid.status} ${capAfterVoid.issue}`);
  verdict(void2.status === 422 && void2.issue === "PREVIOUSLY_VOIDED", `second void (new request id) -> ${void2.status} ${void2.issue}`);
  verdict(aRead.body.status === "VOIDED", `voided authorization reads ${aRead.body.status}`);
  verdict(bCap.status === 201 && bVoid.status === 422 && bVoid.issue === "PREVIOUSLY_CAPTURED", `void of a captured hold (capture ${bCap.body.status}) -> ${bVoid.status} ${bVoid.issue}`);
  say(`INFO  captured authorization reads ${bRead.body.status}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
