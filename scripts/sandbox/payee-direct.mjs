// Gate: can a card-funded AUTHORIZE order name the bill's payee (an unconsented business sandbox account) so the
// captured money goes straight to the payee, not through Second Look? $84.00 hold -> capture; $20.00 hold -> void.
// Decides the money model for bills (pass-through vs payee-direct).
// Run: node --env-file=.env scripts/sandbox/payee-direct.mjs

import { ACCOUNTS, cardOrder, firstAuthorization, getBalance, say, startGate, usd, verdict } from "./lib.mjs";

const SCRIPT = "payee-direct";
const PAYEE = ACCOUNTS.electric;

try {
  const gate = await startGate(SCRIPT);
  const tag = `gate-payee-${Date.now()}`;
  const before = await getBalance(gate, "0-balance-before");

  // A: hold and capture, payee = the electric company.
  const a = await gate.post(
    "a1-create-order-84",
    "/v2/checkout/orders",
    cardOrder({ intent: "AUTHORIZE", cents: 8400, description: "Electric bill (gate test)", customId: `${tag}-a`, payeeEmail: PAYEE }),
  );
  const aAuth = firstAuthorization(a.body);
  const aPayee = a.body.purchase_units?.[0]?.payee;
  say(`  order ${a.body.id ?? "?"} ${a.body.status ?? "?"}; authorization ${aAuth?.id ?? "none"} ${aAuth?.status ?? ""}; payee ${aPayee?.email_address ?? "?"} merchant_id ${aPayee?.merchant_id ?? "?"}`);

  let cap;
  let capRead;
  if (aAuth) {
    cap = await gate.post("a2-capture", `/v2/payments/authorizations/${aAuth.id}/capture`, {
      amount: usd(8400),
      final_capture: true,
      invoice_id: `${tag}-a`,
    });
    if (cap.body.id) {
      capRead = await gate.get("a3-read-capture", `/v2/payments/captures/${cap.body.id}`);
      const b = capRead.body.seller_receivable_breakdown;
      say(`  capture ${capRead.body.id} ${capRead.body.status}; payee ${capRead.body.payee?.email_address ?? "?"} merchant_id ${capRead.body.payee?.merchant_id ?? "?"}; gross ${b?.gross_amount?.value}, fee ${b?.paypal_fee?.value}, net ${b?.net_amount?.value}`);
    }
    const order = await gate.get("a4-read-order", `/v2/checkout/orders/${a.body.id}`);
    const op = order.body.purchase_units?.[0]?.payee;
    say(`  order payee ${op?.email_address ?? "?"} merchant_id ${op?.merchant_id ?? "?"}`);
  }

  // B: hold and void, same payee.
  const b = await gate.post(
    "b1-create-order-20",
    "/v2/checkout/orders",
    cardOrder({ intent: "AUTHORIZE", cents: 2000, description: "Electric bill (gate test)", customId: `${tag}-b`, payeeEmail: PAYEE }),
  );
  const bAuth = firstAuthorization(b.body);
  say(`  order ${b.body.id ?? "?"} ${b.body.status ?? "?"}; authorization ${bAuth?.id ?? "none"} ${bAuth?.status ?? ""}`);
  let bVoid;
  if (bAuth) {
    bVoid = await gate.post("b2-void", `/v2/payments/authorizations/${bAuth.id}/void`, undefined);
    await gate.get("b3-read-authorization", `/v2/payments/authorizations/${bAuth.id}`);
  }

  const after = await getBalance(gate, "9-balance-after");

  say("");
  verdict(a.status === 201 && aAuth?.status === "CREATED", `card AUTHORIZE to the electric company -> HTTP ${a.status} ${a.body.status ?? a.issue}`);
  verdict(aPayee?.email_address === PAYEE, `order keeps the payee (merchant_id ${aPayee?.merchant_id ?? "?"})`);
  verdict(cap?.status === 201 && ["COMPLETED", "PENDING"].includes(cap.body.status), `capture -> HTTP ${cap?.status ?? "-"} ${cap?.body.status ?? cap?.issue ?? "not attempted"}`);
  verdict(capRead?.body.payee?.email_address === PAYEE, `capture's payee is the electric company, not Second Look`);
  verdict([200, 204].includes(bVoid?.status), `void of a payee-direct hold -> HTTP ${bVoid?.status ?? "-"} ${bVoid?.body.status ?? bVoid?.issue ?? "not attempted"}`);
  say(`INFO  Second Look balance ${before.total} -> ${after.total} (available ${before.available} -> ${after.available})`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
