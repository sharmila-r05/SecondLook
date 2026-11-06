// Dev and test only: gives a demo family one held payment, as if Margaret had asked to pay $1,500 to a new payee and
// approved it on PayPal. The hold is real (a card-funded AUTHORIZE order in the sandbox, which needs no buyer login),
// so Deny and Approve on the family screen exercise real voids, captures and payouts.
// Run: node --env-file=.env scripts/dev/hold-for-test.mjs [family id]   (default: the most recently created family)

import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { cardOrder, firstAuthorization, newRequestId, startGate } from "../sandbox/lib.mjs";

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const [family] = process.argv[2]
    ? await sql`select id, demo_session_id from families where id = ${process.argv[2]}`
    : await sql`select id, demo_session_id from families order by created_at desc limit 1`;
  if (!family) throw new Error("no family found");

  const amountCents = 150000;
  const rules = [
    { id: "new_payee", chip: "New payee", fact: "Tech Support Line isn’t on the family’s list" },
    { id: "over_limit", chip: "Over $300.00 limit", fact: "$1,500.00 is over her $300.00 limit" },
    { id: "scam_wording", chip: "Tech-support story", fact: "She mentioned “hacked”" },
  ];
  const note = rules.map((r) => `${r.fact}.`).join(" ");

  const gate = await startGate("dev-hold");
  const orderRequestId = newRequestId();
  const order = await gate.post("create-card-hold", "/v2/checkout/orders", cardOrder({ intent: "AUTHORIZE", cents: amountCents, description: "Tech Support Line", customId: "dev-hold" }), { requestId: orderRequestId });
  const authorization = firstAuthorization(order.body);
  if (!authorization?.id) throw new Error(`no authorization (HTTP ${order.status})`);

  await sql.begin(async (tx) => {
    const [payee] = await tx`
      insert into payees (demo_session_id, family_id, name, known) values (${family.demo_session_id}, ${family.id}, 'Tech Support Line', false)
      returning id`;
    const [request] = await tx`
      insert into payment_requests (demo_session_id, family_id, payee_id, amount_cents, request_text, status, triggered_rules, risk_note, hold_expires_at)
      values (${family.demo_session_id}, ${family.id}, ${payee.id}, ${amountCents}, 'Pay $1,500 to tech support, they said my computer is hacked',
              'held', ${tx.json(rules)}, ${note}, now() + interval '10 minutes')
      returning id`;
    await tx`
      insert into payments (demo_session_id, family_id, payment_request_id, kind, paypal_request_id, order_request_id, paypal_order_id,
                            paypal_authorization_id, amount_cents, status)
      values (${family.demo_session_id}, ${family.id}, ${request.id}, 'authorization', ${randomUUID()}, ${orderRequestId}, ${order.body.id},
              ${authorization.id}, ${amountCents}, ${authorization.status})`;
    await tx`insert into events (demo_session_id, family_id, type, payload) values (${family.demo_session_id}, ${family.id}, 'request:held', ${tx.json({ requestId: request.id, note })})`;
    console.log(`held request ${request.id} in family ${family.id} (authorization ${authorization.id})`);
  });
} finally {
  await sql.end();
}
