// The PayPal client against real sandbox answers recorded on 6 Nov (test/fixtures/paypal, emails removed).
// Nothing here calls PayPal: the SDK gets a stub axios adapter and a seeded token, the REST calls a stub fetch.

import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  authorizeOrder,
  captureAuthorization,
  createAuthorizeOrder,
  createInvoice,
  createPayout,
  PayPalError,
  sendInvoice,
  topUpSandboxBalance,
  setPayPalTransportForTests,
  voidAuthorization,
} from "@/lib/paypal";

interface Recorded {
  http_status: number;
  debug_id?: string;
  response?: unknown;
}
interface Sent {
  url: string;
  method: string;
  requestId?: string;
  body?: Record<string, unknown>;
}

const recorded = (name: string): Recorded => JSON.parse(readFileSync(new URL(`./fixtures/paypal/${name}.json`, import.meta.url), "utf8"));

function header(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;
  const h = headers as { get?: (n: string) => string | null } & Record<string, string>;
  if (typeof h.get === "function") return h.get(name) ?? undefined;
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? h[key] : undefined;
}

/** Answers each PayPal call, in order, with the next recorded response; returns what was sent. */
function replay(...names: string[]): Sent[] {
  const queue = names.map(recorded);
  const sent: Sent[] = [];
  const next = () => {
    const answer = queue.shift();
    if (!answer) throw new Error("the code made more PayPal calls than were recorded");
    return answer;
  };
  setPayPalTransportForTests({
    adapter: async (config) => {
      const answer = next();
      const c = config as typeof config & { headers?: unknown };
      sent.push({ url: c.url, method: c.method.toUpperCase(), requestId: header(c.headers, "PayPal-Request-Id"), body: c.data ? JSON.parse(c.data) : undefined });
      return {
        data: answer.response === undefined ? "" : JSON.stringify(answer.response),
        status: answer.http_status,
        statusText: "",
        headers: { "content-type": "application/json", "paypal-debug-id": answer.debug_id ?? "" },
        config,
      };
    },
    fetch: async (url, init) => {
      const answer = next();
      sent.push({
        url: String(url),
        method: (init?.method ?? "GET").toUpperCase(),
        requestId: header(init?.headers, "PayPal-Request-Id"),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(JSON.stringify(answer.response ?? {}), {
        status: answer.http_status,
        headers: { "content-type": "application/json", "paypal-debug-id": answer.debug_id ?? "" },
      });
    },
  });
  return sent;
}

beforeAll(() => {
  process.env.PAYPAL_ENV = "sandbox";
  process.env.PAYPAL_CLIENT_ID = "test-client-id";
  process.env.PAYPAL_CLIENT_SECRET = "test-client-secret";
});
afterEach(() => setPayPalTransportForTests(null));

const order = { amountCents: 8400, description: "Hollowbrook Electric bill", customId: "req-1", returnUrl: "http://localhost/r", cancelUrl: "http://localhost/c" };

describe("hard rule 4: every POST carries the stored PayPal-Request-Id", () => {
  it("refuses to send a POST without one", async () => {
    const sent = replay();
    await expect(createAuthorizeOrder({ ...order, requestId: "" })).rejects.toThrow(/PayPal-Request-Id/);
    await expect(captureAuthorization({ authorizationId: "A", requestId: "", invoiceId: "i" })).rejects.toThrow(/PayPal-Request-Id/);
    expect(sent).toHaveLength(0);
  });
});

describe("orders and payments (server SDK)", () => {
  it("creates an AUTHORIZE order Margaret approves on PayPal", async () => {
    const sent = replay("order-create-paypal");
    const result = await createAuthorizeOrder({ ...order, requestId: "rid-create" });

    expect(result.status).toBe("PAYER_ACTION_REQUIRED");
    expect(result.approveUrl).toMatch(/^https:\/\/www\.sandbox\.paypal\.com\/checkoutnow\?token=/);
    const [request] = sent;
    expect(request).toMatchObject({ method: "POST", requestId: "rid-create" });
    expect(request?.url).toMatch(/\/v2\/checkout\/orders$/);
    expect(request?.body).toMatchObject({
      intent: "AUTHORIZE",
      purchase_units: [{ custom_id: "req-1", amount: { currency_code: "USD", value: "84.00" } }],
      payment_source: { paypal: { experience_context: { shipping_preference: "NO_SHIPPING", user_action: "CONTINUE" } } },
    });
  });

  it("captures a hold in full", async () => {
    const sent = replay("capture");
    const result = await captureAuthorization({ authorizationId: "AUTH1", requestId: "rid-capture", invoiceId: "sl-req-1" });
    expect(result.status).toBe("COMPLETED");
    expect(result.captureId).toBeTruthy();
    expect(sent[0]?.url).toMatch(/\/v2\/payments\/authorizations\/AUTH1\/capture$/);
    expect(sent[0]?.body).toMatchObject({ final_capture: true, invoice_id: "sl-req-1" });
  });

  it("names PayPal's issue and debug_id when a capture comes too late", async () => {
    replay("capture-after-void");
    const err = await captureAuthorization({ authorizationId: "AUTH1", requestId: "rid", invoiceId: "i" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect(err).toMatchObject({ status: 422, issue: "AUTHORIZATION_VOIDED", debugId: recorded("capture-after-void").debug_id });
  });

  it("voids a hold, and treats PREVIOUSLY_VOIDED as already released", async () => {
    replay("void", "void-again");
    await expect(voidAuthorization({ authorizationId: "AUTH1", requestId: "rid-1" })).resolves.toMatchObject({ status: "VOIDED" });
    await expect(voidAuthorization({ authorizationId: "AUTH1", requestId: "rid-2" })).resolves.toMatchObject({ status: "VOIDED" });
  });

  it("authorizeOrder sends the stored request id to the order's authorize path", async () => {
    const sent = replay("capture-after-void");
    await expect(authorizeOrder({ orderId: "ORDER1", requestId: "rid-auth" })).rejects.toBeInstanceOf(PayPalError);
    expect(sent[0]).toMatchObject({ method: "POST", requestId: "rid-auth" });
    expect(sent[0]?.url).toMatch(/\/v2\/checkout\/orders\/ORDER1\/authorize$/);
  });
});

describe("payouts (REST)", () => {
  const payout = { requestId: "rid-payout", receiverEmail: "aide@example.test", amountCents: 15000, note: "Week of Nov 2", senderItemId: "period-1", emailSubject: "Your pay" };

  it("pays one person with a fixed sender_batch_id", async () => {
    const sent = replay("payout-create");
    const result = await createPayout({ ...payout, senderBatchId: "sl-period-1" });
    expect(result.payoutBatchId).toBeTruthy();
    expect(sent[0]).toMatchObject({ method: "POST", requestId: "rid-payout" });
    expect(sent[0]?.body).toMatchObject({
      sender_batch_header: { sender_batch_id: "sl-period-1" },
      items: [{ recipient_type: "EMAIL", amount: { value: "150.00", currency: "USD" } }],
    });
  });

  it("on a reused sender_batch_id, returns the original batch instead of paying twice", async () => {
    const sent = replay("payout-replay", "payout-get");
    const result = await createPayout({ ...payout, senderBatchId: "sl-period-1" });
    expect(result.batchStatus).toBe("SUCCESS");
    expect(sent.map((s) => s.method)).toEqual(["POST", "GET"]);
    expect(sent[1]?.url).toContain(`/v1/payments/payouts/${result.payoutBatchId}`);
  });
});

describe("Invoicing (replayed)", () => {
  const draft = {
    invoiceNumber: "SL-GATE-20261106T062703",
    requestId: "7d0c9a52-8a8e-4c37-9a4e-1f8a2f1d2b11",
    recipientName: "Sarah",
    recipientEmail: "sarah@example.test",
    invoicerEmail: "secondlook@example.test",
    amountCents: 7500,
    itemName: "Care for Margaret, Nov 5–9",
    note: "Your share of Rosa's pay.",
  };

  it("creates a draft with the fixed invoice number and returns its pay link", async () => {
    const sent = replay("invoice-create");
    const invoice = await createInvoice(draft);
    expect(invoice).toMatchObject({ invoiceId: "INV2-7WL8-A4UN-4A72-PHBF", status: "DRAFT" });
    expect(invoice.payUrl).toMatch(/^https:\/\/www\.sandbox\.paypal\.com\/invoice\/p\/#/);
    expect(sent[0]).toMatchObject({ method: "POST", requestId: draft.requestId });
    expect(sent[0]?.body).toMatchObject({ detail: { invoice_number: draft.invoiceNumber, currency_code: "USD" }, items: [{ unit_amount: { value: "75.00" } }] });
  });

  it("finds the invoice it already created when PayPal says the number exists", async () => {
    const sent = replay("invoice-duplicate", "invoice-search", "invoice-get");
    const invoice = await createInvoice(draft);
    expect(invoice).toMatchObject({ invoiceId: "INV2-7WL8-A4UN-4A72-PHBF", status: "UNPAID" });
    expect(sent.map((c) => c.method)).toEqual(["POST", "POST", "GET"]);
    expect(sent[1]?.body).toEqual({ invoice_number: draft.invoiceNumber });
    expect(new Set(sent.filter((c) => c.requestId).map((c) => c.requestId)).size).toBe(2);
  });

  it("sends a draft without email, then reads it back as unpaid", async () => {
    const sent = replay("invoice-create", "invoice-send", "invoice-get");
    const invoice = await sendInvoice({ invoiceId: "INV2-7WL8-A4UN-4A72-PHBF", requestId: "7d0c9a52-8a8e-4c37-9a4e-1f8a2f1d-send" });
    expect(invoice.status).toBe("UNPAID");
    expect(sent[1]).toMatchObject({ method: "POST", body: { send_to_recipient: false, send_to_invoicer: false } });
  });

  it("doesn't send an invoice twice", async () => {
    const sent = replay("invoice-get");
    const invoice = await sendInvoice({ invoiceId: "INV2-7WL8-A4UN-4A72-PHBF", requestId: "7d0c9a52-8a8e-4c37-9a4e-1f8a2f1d-send" });
    expect(invoice.status).toBe("UNPAID");
    expect(sent).toHaveLength(1);
  });
});

describe("sandbox balance top-up (replayed)", () => {
  const payout = {
    senderBatchId: "sl-care-test",
    requestId: "5b2f0c1e-9a7d-4d1b-8f3e-2c6a9b8d7e10",
    receiverEmail: "rosa@example.test",
    amountCents: 10000,
    note: "Pay for 2 visits",
    senderItemId: "period-1",
    emailSubject: "Your pay",
  };

  it("surfaces a payout refused for insufficient funds as INSUFFICIENT_FUNDS", async () => {
    replay("payout-insufficient");
    await expect(createPayout(payout)).rejects.toMatchObject({ issue: "INSUFFICIENT_FUNDS", status: 422 });
  });

  it("tops up with a card-funded CAPTURE order that completes at create", async () => {
    const sent = replay("top-up-capture");
    const result = await topUpSandboxBalance({ requestId: "0d6c2f7a-3e1b-4c5d-9a8f-7b6e5d4c3b2a", amountCents: 200000 });
    expect(result.status).toBe("COMPLETED");
    expect(sent[0]).toMatchObject({ method: "POST", requestId: "0d6c2f7a-3e1b-4c5d-9a8f-7b6e5d4c3b2a" });
    expect(sent[0]?.body).toMatchObject({ intent: "CAPTURE", purchase_units: [{ amount: { currency_code: "USD", value: "2000.00" } }] });
    expect(sent[0]?.body).toHaveProperty("payment_source.card");
  });
});
