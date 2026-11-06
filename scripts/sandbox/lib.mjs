// Shared helpers for the sandbox gate scripts. Sandbox only; never prints a token, the client secret or an email.

export const BASE = "https://api-m.sandbox.paypal.com";

export function assertSandbox() {
  if (process.env.PAYPAL_ENV !== "sandbox") {
    console.error('Refusing to run: PAYPAL_ENV must be exactly "sandbox".');
    process.exit(1);
  }
}

// fresh: ask PayPal for a new token instead of the cached one (needed after changing the app's features).
export async function getToken({ fresh = false } = {}) {
  assertSandbox();
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) {
    console.error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must both be set in .env.");
    process.exit(1);
  }
  const started = Date.now();
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=client_credentials${fresh ? "&ignoreCache=true" : ""}`,
  });
  const body = await res.json().catch(() => ({}));
  const debugId = res.headers.get("paypal-debug-id") ?? body.debug_id;
  if (!res.ok) {
    const reason = [body.error, body.error_description].filter(Boolean).join(": ");
    throw new Error(`token request failed: HTTP ${res.status} ${reason} (debug_id ${debugId ?? "none"})`);
  }
  return {
    accessToken: body.access_token,
    expiresIn: body.expires_in,
    scopes: String(body.scope ?? "").split(" ").filter(Boolean).sort(),
    ms: Date.now() - started,
  };
}

// Read-only call; returns PayPal's answer instead of throwing so gates can record error responses too.
export async function paypalGet(accessToken, path) {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  return {
    status: res.status,
    body,
    issue: body.details?.[0]?.issue ?? body.name ?? body.error,
    debugId: res.headers.get("paypal-debug-id") ?? body.debug_id,
    ms: Date.now() - started,
  };
}
