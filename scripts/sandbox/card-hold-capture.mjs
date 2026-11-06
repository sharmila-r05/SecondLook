// Gate: a card-funded AUTHORIZE order holds $84.00 at create; capture with final_capture; a replay with the same
// PayPal-Request-Id returns the same capture; a further capture is refused (AUTHORIZATION_ALREADY_CAPTURED).
// Run: node --env-file=.env scripts/sandbox/card-hold-capture.mjs

import { cardOrder, firstAuthorization, newRequestId, say, sleep, startGate, usd, verdict } from "./lib.mjs";

const SCRIPT = "card-hold-capture";
const CENTS = 8400;

try {
  const gate = await startGate(SCRIPT);
  const tag = `gate-cap-${Date.now()}`;

  const created = await gate.post(
    "1-create-order",
    "/v2/checkout/orders",
    cardOrder({ intent: "AUTHORIZE", cents: CENTS, description: "Electric bill (gate test)", customId: tag }),
  );
  const auth = firstAuthorization(created.body);
  say(`  order ${created.body.id ?? "?"} ${created.body.status ?? "?"}; authorization ${auth?.id ?? "none"} ${auth?.status ?? ""}, expires ${auth?.expiration_time ?? "?"}`);
  if (!auth) process.exit(1);

  const read = await gate.get("2-read-authorization", `/v2/payments/authorizations/${auth.id}`);
  say(`  authorization ${read.body.status}, amount ${read.body.amount?.value}, expiration ${read.body.expiration_time}`);

  const capturePath = `/v2/payments/authorizations/${auth.id}/capture`;
  const captureBody = { amount: usd(CENTS), final_capture: true, invoice_id: `${tag}-1` };
  const captureRid = newRequestId();
  const cap1 = await gate.post("3-capture", capturePath, captureBody, { requestId: captureRid });
  const b = cap1.body.seller_receivable_breakdown;
  say(`  capture ${cap1.body.id ?? "?"} ${cap1.body.status ?? "?"}${cap1.body.status_details?.reason ? ` (${cap1.body.status_details.reason})` : ""}; gross ${b?.gross_amount?.value}, fee ${b?.paypal_fee?.value}, net ${b?.net_amount?.value}`);

  const cap2 = await gate.post("4-capture-replay-same-request-id", capturePath, captureBody, { requestId: captureRid });
  say(`  replay capture ${cap2.body.id ?? "?"} ${cap2.body.status ?? ""}`);

  const cap3 = await gate.post("5-capture-again-new-request-id", capturePath, { ...captureBody, invoice_id: `${tag}-2` });

  let capRead = await gate.get("6-read-capture", `/v2/payments/captures/${cap1.body.id}`);
  for (let i = 0; capRead.body.status === "PENDING" && i < 10; i++) {
    await sleep(3000);
    capRead = await gate.get(`6-read-capture-poll-${i + 1}`, `/v2/payments/captures/${cap1.body.id}`);
  }
  const authAfter = await gate.get("7-read-authorization-after", `/v2/payments/authorizations/${auth.id}`);

  say("");
  verdict(created.status === 201 && created.body.status === "COMPLETED" && auth.status === "CREATED", "card AUTHORIZE order held the money at create, no approval step");
  verdict(cap1.status === 201 && ["COMPLETED", "PENDING"].includes(cap1.body.status), `capture ${cap1.body.status} (${cap1.ms} ms)`);
  verdict(cap2.status < 300 && cap2.body.id === cap1.body.id, `replay with the same request id -> HTTP ${cap2.status}, same capture id`);
  verdict(cap3.status === 422 && cap3.issue === "AUTHORIZATION_ALREADY_CAPTURED", `further capture -> ${cap3.status} ${cap3.issue}`);
  verdict(authAfter.body.status === "CAPTURED", `authorization now ${authAfter.body.status}; capture reads ${capRead.body.status}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
