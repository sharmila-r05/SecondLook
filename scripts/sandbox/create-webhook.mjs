// Registers the app's PayPal webhook (or finds the one already registered for the URL) and prints its id, which goes
// into PAYPAL_WEBHOOK_ID. Run: node --env-file=.env scripts/sandbox/create-webhook.mjs https://<service>.onrender.com
import { BASE, getToken, newRequestId, paypalGet, paypalPost, say } from "./lib.mjs";

const base = (process.argv[2] ?? process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
if (!base.startsWith("https://")) {
  console.error("usage: create-webhook.mjs https://<public app URL>");
  process.exit(1);
}
const url = `${base}/api/paypal/webhook`;
const EVENT_TYPES = [
  "CHECKOUT.ORDER.APPROVED",
  "PAYMENT.AUTHORIZATION.CREATED",
  "PAYMENT.AUTHORIZATION.VOIDED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.PENDING",
  "PAYMENT.CAPTURE.DECLINED",
  "PAYMENT.PAYOUTSBATCH.SUCCESS",
  "PAYMENT.PAYOUTSBATCH.DENIED",
  "INVOICING.INVOICE.PAID",
];

const { accessToken: token } = await getToken();
const created = await paypalPost(token, "/v1/notifications/webhooks", { url, event_types: EVENT_TYPES.map((name) => ({ name })) }, newRequestId());
if (created.status === 201) {
  say(`webhook ${created.body.id} registered for ${url}`);
} else {
  const list = await paypalGet(token, "/v1/notifications/webhooks");
  const existing = list.body?.webhooks?.find((w) => w.url === url);
  if (!existing) {
    say(`could not register (HTTP ${created.status} ${created.body?.name ?? ""}, debug_id ${created.debugId ?? created.body?.debug_id ?? "?"}) at ${BASE}`);
    process.exit(1);
  }
  say(`webhook ${existing.id} already registered for ${url}`);
}
