// Gate: connect Margaret's PayPal once (Vault v3), then pay a bill with no PayPal redirect.
//
//   setup            POST /v3/vault/setup-tokens (PayPal wallet, usage_type MERCHANT). Prints the approve link only.
//                    Approving it needs a person logged in at sandbox.paypal.com as Margaret's sandbox account.
//   finish [id]      After approval: read the setup token, POST /v3/vault/payment-tokens, then run `order` with the
//                    new vault id. Without an id, uses the setup token from the last `setup` run.
//   order [vault_id] AUTHORIZE orders with payment_source.paypal.vault_id: does the hold come back at create, with no
//                    buyer step? Replays the create, voids that hold, then captures a small second one. Without an
//                    id, uses the PayPal Margaret most recently connected in the app (the local database).
//   purchase         The alternative: an AUTHORIZE order with attributes.vault.store_in_vault ON_SUCCESS (vault
//                    during the first bill). Prints the approve link.
//   purchase-finish [order_id]  After approval: authorize, read the vault id off the authorization response, void
//                    the hold, then run `order` with that vault id.
//   refusals         No approval needed: what PayPal answers for an unapproved setup token and an unknown vault id.
//
// Run: node --env-file=.env scripts/sandbox/vault-gate.mjs <mode> [id]
// Answers are saved, emails redacted, under tmp/sandbox-runs/vault-gate/; the ones tests replay are also written to
// test/fixtures/paypal/ with names, phones and addresses removed.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { firstAuthorization, newRequestId, redact, say, startGate, usd, verdict } from "./lib.mjs";

const SCRIPT = "vault-gate";
const RUNS = fileURLToPath(new URL(`../../tmp/sandbox-runs/${SCRIPT}/`, import.meta.url));
const FIXTURES = fileURLToPath(new URL("../../test/fixtures/paypal/", import.meta.url));
// Where PayPal sends the browser after approval. Nothing answers there (a "not found" page is expected): the ids
// are printed here and saved under tmp/.
const RETURN = "http://localhost:3104/gate/vault-approved";
const CANCEL = "http://localhost:3104/gate/vault-cancelled";

const [mode = "setup", arg] = process.argv.slice(2);
const gate = await startGate(SCRIPT);

// The body the app sends for "Connect PayPal once" (src/lib/paypal-vault.ts), as raw REST.
const setupBody = {
  payment_source: {
    paypal: {
      description: "Second Look pays the bills you confirm, from your PayPal account",
      usage_pattern: "IMMEDIATE",
      usage_type: "MERCHANT",
      customer_type: "CONSUMER",
      permit_multiple_payment_tokens: false,
      experience_context: {
        brand_name: "Second Look",
        locale: "en-US",
        shipping_preference: "NO_SHIPPING",
        return_url: RETURN,
        cancel_url: CANCEL,
      },
    },
  },
};

const lastRun = (step) => {
  try {
    return JSON.parse(readFileSync(`${RUNS}${step}.json`, "utf8"));
  } catch {
    return undefined;
  }
};

// A test fixture: the saved run minus anything personal (emails are already roles; names, phones, addresses go too).
function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    if (key === "name" && v && typeof v === "object") out[key] = { given_name: "<given>", surname: "<surname>" };
    else if (key === "full_name") out[key] = "<name>";
    else if (key === "phone" || key === "phone_number") continue;
    else if (key === "address" && v && typeof v === "object") out[key] = v.country_code ? { country_code: v.country_code } : {};
    else out[key] = scrub(v);
  }
  return out;
}
function fixture(step, name) {
  const run = lastRun(step);
  if (!run) return;
  writeFileSync(`${FIXTURES}${name}.json`, `${JSON.stringify(scrub(redact(run)), null, 2)}\n`);
  say(`  fixture test/fixtures/paypal/${name}.json`);
}

async function setup() {
  const r = await gate.post("1-setup-token", "/v3/vault/setup-tokens", setupBody, { requestId: newRequestId() });
  fixture("1-setup-token", "vault-setup-token-create");
  const approve = r.body?.links?.find((l) => l.rel === "approve")?.href;
  verdict(r.status < 300 && r.body?.status === "PAYER_ACTION_REQUIRED" && Boolean(approve), "setup token created, waiting for the payer");
  say(`setup token ${r.body?.id ?? "?"}, customer ${r.body?.customer?.id ?? "?"}`);
  say(`approve link (log in as Margaret's sandbox account): ${approve ?? "none"}`);
  say("then: node --env-file=.env scripts/sandbox/vault-gate.mjs finish");
}

async function finish(setupTokenId) {
  const id = setupTokenId ?? lastRun("1-setup-token")?.response?.id;
  if (!id) throw new Error("no setup token id: run `setup` first, or pass one");
  const read = await gate.get("2-setup-token-read", `/v3/vault/setup-tokens/${encodeURIComponent(id)}`);
  verdict(read.body?.status === "APPROVED", `setup token reads APPROVED (it reads ${read.body?.status ?? read.issue})`);
  const token = await gate.post("3-payment-token", "/v3/vault/payment-tokens", { payment_source: { token: { id, type: "SETUP_TOKEN" } } }, { requestId: newRequestId() });
  fixture("3-payment-token", "vault-payment-token-create");
  if (!token.body?.id) return verdict(false, `payment token created (${token.issue ?? token.status})`);
  verdict(true, `payment token ${token.body.id}, customer ${token.body.customer?.id ?? "?"}`);
  await order(token.body.id);
}

const vaultedOrder = (vaultId, cents, label) => ({
  intent: "AUTHORIZE",
  purchase_units: [{ reference_id: label, custom_id: label, description: "Hollowbrook Electric, paid by Margaret through Second Look", amount: usd(cents) }],
  payment_source: { paypal: { vault_id: vaultId } },
});

// The PayPal Margaret most recently connected through the app's "Connect PayPal" (never printed).
async function connectedInApp() {
  const { default: postgres } = await import("postgres");
  const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const [row] = await sql`select paypal_vault_id as id from members where paypal_vault_id is not null order by vaulted_at desc limit 1`;
    return row?.id;
  } finally {
    await sql.end();
  }
}

async function order(given) {
  const vaultId = given ?? (await connectedInApp());
  if (!vaultId) throw new Error("no vault id: pass one, or connect Margaret's PayPal in the app first");
  const requestId = newRequestId();
  const body = vaultedOrder(vaultId, 8400, "gate-vault-1");
  const created = await gate.post("4-order-vaulted", "/v2/checkout/orders", body, { requestId });
  fixture("4-order-vaulted", "order-create-vaulted");
  let hold = firstAuthorization(created.body);
  say(`order ${created.body?.id} status ${created.body?.status}; authorization ${hold?.id ?? "none"} ${hold?.status ?? ""} expires ${hold?.expiration_time ?? "?"}`);
  if (!hold && created.body?.status === "APPROVED") {
    const authorized = await gate.post("4b-authorize", `/v2/checkout/orders/${created.body.id}/authorize`, undefined, { requestId: newRequestId() });
    hold = firstAuthorization(authorized.body);
  }
  verdict(Boolean(hold?.id) && hold.status === "CREATED", "a vaulted AUTHORIZE order places the hold with no buyer step");
  if (created.body?.status === "PAYER_ACTION_REQUIRED") say("  (the order wants the payer: the vault id doesn't skip approval here)");

  const again = await gate.post("5-order-vaulted-replay", "/v2/checkout/orders", body, { requestId });
  verdict(again.body?.id === created.body?.id, "the same PayPal-Request-Id returns the same order");

  if (hold?.id) {
    const voided = await gate.post("6-void", `/v2/payments/authorizations/${hold.id}/void`, undefined, { requestId: newRequestId() });
    verdict(voided.status < 300, `the vaulted hold voids (${voided.body?.status ?? voided.status})`);
  }

  // The auto-approved path: a small vaulted hold captured at once (sandbox money from Margaret to Second Look).
  const small = await gate.post("7-order-vaulted-small", "/v2/checkout/orders", vaultedOrder(vaultId, 500, "gate-vault-2"), { requestId: newRequestId() });
  const smallHold = firstAuthorization(small.body);
  if (smallHold?.id) {
    const taken = await gate.post("8-capture", `/v2/payments/authorizations/${smallHold.id}/capture`, { final_capture: true, invoice_id: `sl-gate-vault-${Date.now()}` }, { requestId: newRequestId() });
    verdict(taken.body?.status === "COMPLETED", `a vaulted hold captures (${taken.body?.status ?? taken.issue})`);
  }
}

async function purchase() {
  const r = await gate.post(
    "p1-order-store-in-vault",
    "/v2/checkout/orders",
    {
      intent: "AUTHORIZE",
      purchase_units: [{ reference_id: "gate-p", custom_id: "gate-p", description: "Hollowbrook Electric, paid by Margaret through Second Look", amount: usd(8400) }],
      payment_source: {
        paypal: {
          attributes: { vault: { store_in_vault: "ON_SUCCESS", usage_type: "MERCHANT", customer_type: "CONSUMER" } },
          experience_context: {
            brand_name: "Second Look",
            shipping_preference: "NO_SHIPPING",
            user_action: "CONTINUE",
            return_url: RETURN,
            cancel_url: CANCEL,
          },
        },
      },
    },
    { requestId: newRequestId() },
  );
  const link = r.body?.links?.find((l) => l.rel === "payer-action" || l.rel === "approve");
  verdict(r.status < 300 && r.body?.status === "PAYER_ACTION_REQUIRED", "an AUTHORIZE order asking to vault on success is accepted");
  say(`order ${r.body?.id ?? "?"}; approve link (log in as Margaret's sandbox account): ${link?.href ?? "none"}`);
  say("then: node --env-file=.env scripts/sandbox/vault-gate.mjs purchase-finish");
}

async function purchaseFinish(orderId) {
  const id = orderId ?? lastRun("p1-order-store-in-vault")?.response?.id;
  if (!id) throw new Error("no order id: run `purchase` first, or pass one");
  const r = await gate.post("p2-authorize", `/v2/checkout/orders/${id}/authorize`, undefined, { requestId: newRequestId() });
  const vault = r.body?.payment_source?.paypal?.attributes?.vault;
  const hold = firstAuthorization(r.body);
  say(`authorization ${hold?.id ?? "none"} ${hold?.status ?? ""}; vault ${vault?.id ?? "none"} status ${vault?.status ?? "?"} customer ${vault?.customer?.id ?? "?"}`);
  verdict(vault?.status === "VAULTED" && Boolean(vault.id), "authorizing the first order vaulted her PayPal");
  if (hold?.id) await gate.post("p3-void", `/v2/payments/authorizations/${hold.id}/void`, undefined, { requestId: newRequestId() });
  if (vault?.id) await order(vault.id);
}

// Unhappy paths the app must handle, no approval needed: a payment token from a setup token nobody approved (Margaret
// closed PayPal's page), and an order with a vault id PayPal doesn't know (deleted or never made).
async function refusals() {
  const fresh = await gate.post("r1-setup-token", "/v3/vault/setup-tokens", setupBody, { requestId: newRequestId() });
  const read = await gate.get("r2-setup-token-read", `/v3/vault/setup-tokens/${encodeURIComponent(fresh.body?.id ?? "none")}`);
  say(`an unapproved setup token reads ${read.body?.status ?? read.issue}`);
  const early = await gate.post("r3-payment-token-unapproved", "/v3/vault/payment-tokens", { payment_source: { token: { id: fresh.body?.id, type: "SETUP_TOKEN" } } }, { requestId: newRequestId() });
  fixture("r3-payment-token-unapproved", "vault-payment-token-unapproved");
  verdict(early.status >= 400, `a payment token from an unapproved setup token is refused (${early.status} ${early.issue})`);
  const unknown = await gate.post("r4-order-unknown-vault", "/v2/checkout/orders", vaultedOrder("0000000", 8400, "gate-vault-unknown"), { requestId: newRequestId() });
  fixture("r4-order-unknown-vault", "order-create-vaulted-unknown");
  verdict(unknown.status >= 400, `an order with an unknown vault id is refused (${unknown.status} ${unknown.issue})`);
}

if (mode === "setup") await setup();
else if (mode === "finish") await finish(arg);
else if (mode === "order") await order(arg);
else if (mode === "purchase") await purchase();
else if (mode === "purchase-finish") await purchaseFinish(arg);
else if (mode === "refusals") await refusals();
else {
  console.error("modes: setup | finish [setup_token_id] | order <vault_id> | purchase | purchase-finish [order_id] | refusals");
  process.exit(1);
}
