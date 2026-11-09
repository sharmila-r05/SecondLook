// "Connect PayPal once" against real sandbox answers recorded by scripts/sandbox/vault-gate.mjs (emails, names,
// phones and addresses removed). Nothing here calls PayPal: the SDK gets a stub axios adapter and a seeded token.
// The answers that need Margaret's one-time approval on PayPal (a payment token, an order paid from it) are replayed
// once `vault-gate.mjs finish` has recorded them; until then those tests are skipped, never faked.

import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { PayPalError, setPayPalTransportForTests } from "@/lib/paypal";
import { createVaultedAuthorizeOrder, createVaultPaymentToken, createVaultSetupToken } from "@/lib/paypal-vault";

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

const fixture = (name: string) => new URL(`./fixtures/paypal/${name}.json`, import.meta.url);
const recorded = (name: string): Recorded => JSON.parse(readFileSync(fixture(name), "utf8"));
const have = (name: string) => existsSync(fixture(name));

function header(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  const h = headers as Record<string, string>;
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? h[key] : undefined;
}

/** Answers each SDK call, in order, with the next recorded response; returns what was sent. */
function replay(...names: string[]): Sent[] {
  const queue = names.map(recorded);
  const sent: Sent[] = [];
  const noFetch = async () => {
    throw new Error("the vault calls go through the SDK, not fetch");
  };
  setPayPalTransportForTests({
    adapter: async (config) => {
      const answer = queue.shift();
      if (!answer) throw new Error("the code made more PayPal calls than were recorded");
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
    fetch: noFetch,
  });
  return sent;
}

beforeAll(() => {
  process.env.PAYPAL_ENV = "sandbox";
  process.env.PAYPAL_CLIENT_ID = "test-client-id";
  process.env.PAYPAL_CLIENT_SECRET = "test-client-secret";
});
afterEach(() => setPayPalTransportForTests(null));

const bill = { vaultId: "vault-1", amountCents: 8400, description: "Hollowbrook Electric, paid by Margaret through Second Look", customId: "req-1" };

describe("hard rule 4: every vault POST carries the stored PayPal-Request-Id", () => {
  it("refuses to send one without it", async () => {
    const sent = replay();
    await expect(createVaultSetupToken({ requestId: "", returnUrl: "http://localhost/r", cancelUrl: "http://localhost/c" })).rejects.toThrow(/PayPal-Request-Id/);
    await expect(createVaultPaymentToken({ requestId: "", setupTokenId: "S" })).rejects.toThrow(/PayPal-Request-Id/);
    await expect(createVaultedAuthorizeOrder({ ...bill, requestId: "" })).rejects.toThrow(/PayPal-Request-Id/);
    expect(sent).toHaveLength(0);
  });
});

describe("connecting her PayPal once", () => {
  it("creates a setup token she approves on PayPal's page", async () => {
    const sent = replay("vault-setup-token-create");
    const result = await createVaultSetupToken({ requestId: "rid-setup", returnUrl: "http://localhost/parent/connect/return", cancelUrl: "http://localhost/parent/connect/cancelled" });

    expect(result.status).toBe("PAYER_ACTION_REQUIRED");
    expect(result.setupTokenId).toBe((recorded("vault-setup-token-create").response as { id: string }).id);
    expect(result.customerId).toBeTruthy();
    expect(result.approveUrl).toMatch(/^https:\/\/www\.sandbox\.paypal\.com\/agreements\/approve\?approval_session_id=/);
    const [request] = sent;
    expect(request).toMatchObject({ method: "POST", requestId: "rid-setup" });
    expect(request?.url).toMatch(/\/v3\/vault\/setup-tokens$/);
    expect(request?.body).toMatchObject({
      payment_source: {
        paypal: {
          usage_type: "MERCHANT",
          customer_type: "CONSUMER",
          permit_multiple_payment_tokens: false,
          experience_context: {
            brand_name: "Second Look",
            shipping_preference: "NO_SHIPPING",
            return_url: "http://localhost/parent/connect/return",
            cancel_url: "http://localhost/parent/connect/cancelled",
          },
        },
      },
    });
  });

  it("names PayPal's issue and debug_id when she never approved the setup token", async () => {
    const sent = replay("vault-payment-token-unapproved");
    const err = await createVaultPaymentToken({ requestId: "rid-token", setupTokenId: "SETUP1" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect(err).toMatchObject({ status: 422, issue: "PAYER_ACTION_REQUIRED", debugId: recorded("vault-payment-token-unapproved").debug_id });
    expect(sent[0]).toMatchObject({ method: "POST", requestId: "rid-token" });
    expect(sent[0]?.body).toEqual({ payment_source: { token: { id: "SETUP1", type: "SETUP_TOKEN" } } });
  });

  it.skipIf(!have("vault-payment-token-create"))("turns her approved setup token into a saved PayPal, keeping nothing personal", async () => {
    replay("vault-payment-token-create");
    const result = await createVaultPaymentToken({ requestId: "rid-token", setupTokenId: "SETUP1" });
    expect(result.vaultId).toBeTruthy();
    expect(Object.keys(result).sort()).toEqual(["customerId", "debugId", "vaultId"]);
  });
});

describe("paying a bill from her saved PayPal", () => {
  it("sends an AUTHORIZE order naming the vault id, with no PayPal page to return from", async () => {
    const sent = replay("order-create-vaulted-unknown");
    await createVaultedAuthorizeOrder({ ...bill, requestId: "rid-order" }).catch(() => undefined);
    const [request] = sent;
    expect(request).toMatchObject({ method: "POST", requestId: "rid-order" });
    expect(request?.url).toMatch(/\/v2\/checkout\/orders$/);
    expect(request?.body).toEqual({
      intent: "AUTHORIZE",
      purchase_units: [{ reference_id: "req-1", custom_id: "req-1", description: bill.description, amount: { currency_code: "USD", value: "84.00" } }],
      payment_source: { paypal: { vault_id: "vault-1" } },
    });
  });

  it("a vault id PayPal doesn't know is a 403 PERMISSION_DENIED, which the bill flow treats as not connected", async () => {
    replay("order-create-vaulted-unknown");
    const err = await createVaultedAuthorizeOrder({ ...bill, requestId: "rid-order" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect(err).toMatchObject({ status: 403, issue: "PERMISSION_DENIED", debugId: recorded("order-create-vaulted-unknown").debug_id });
  });

  it.skipIf(!have("order-create-vaulted"))("gets the hold back at create", async () => {
    replay("order-create-vaulted");
    const result = await createVaultedAuthorizeOrder({ ...bill, requestId: "rid-order" });
    expect(result.authorization).toMatchObject({ status: "CREATED" });
    expect(result.authorization?.authorizationId).toBeTruthy();
  });
});
