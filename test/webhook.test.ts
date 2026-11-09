import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { setPayPalTransportForTests, verifyWebhookSignature } from "@/lib/paypal";

// The verify endpoint answered 200 FAILURE to fake headers (measured 5 Nov); a genuine delivery answers SUCCESS.
function answering(status: string) {
  const sent: { url: string; requestId: string | null; body: Record<string, unknown> }[] = [];
  setPayPalTransportForTests({
    adapter: async () => {
      throw new Error("no SDK calls expected");
    },
    fetch: async (url, init) => {
      sent.push({ url: String(url), requestId: new Headers(init?.headers).get("PayPal-Request-Id"), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ verification_status: status }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  return sent;
}

const deliveryHeaders = new Headers({
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-360caa42-fca2a594-a5cafa77",
  "paypal-transmission-id": "69cd13f0-d67a-11e5-baa3-778b53f4ae55",
  "paypal-transmission-sig": "signature",
  "paypal-transmission-time": "2026-11-09T10:00:00Z",
});
const event = { id: "WH-1", event_type: "INVOICING.INVOICE.PAID", resource: { invoice: { id: "INV2-TEST" } } };

beforeAll(() => {
  process.env.PAYPAL_ENV = "sandbox";
  process.env.PAYPAL_CLIENT_ID = "test-client-id";
  process.env.PAYPAL_CLIENT_SECRET = "test-client-secret";
});
afterEach(() => setPayPalTransportForTests(null));

describe("verifyWebhookSignature", () => {
  it("posts the delivery headers, our webhook id and the event, with a request id from the transmission", async () => {
    const sent = answering("SUCCESS");
    expect(await verifyWebhookSignature({ headers: deliveryHeaders, event, webhookId: "WH-ID" })).toBe(true);
    const call = sent.find((c) => c.url.endsWith("/v1/notifications/verify-webhook-signature"));
    expect(call?.requestId).toBe("verify-69cd13f0-d67a-11e5-baa3-778b53f4".slice(0, 38));
    expect(call?.body).toMatchObject({ auth_algo: "SHA256withRSA", transmission_id: "69cd13f0-d67a-11e5-baa3-778b53f4ae55", webhook_id: "WH-ID", webhook_event: event });
  });

  it("rejects anything PayPal doesn't call SUCCESS", async () => {
    answering("FAILURE");
    expect(await verifyWebhookSignature({ headers: deliveryHeaders, event, webhookId: "WH-ID" })).toBe(false);
  });

  it("rejects a delivery with no transmission id without asking PayPal", async () => {
    const sent = answering("SUCCESS");
    expect(await verifyWebhookSignature({ headers: new Headers(), event, webhookId: "WH-ID" })).toBe(false);
    expect(sent).toHaveLength(0);
  });
});
