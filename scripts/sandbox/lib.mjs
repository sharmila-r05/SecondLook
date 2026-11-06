// Shared helpers for the sandbox gate scripts. Sandbox only; never prints a token, the client secret or an email.

import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const BASE = "https://api-m.sandbox.paypal.com";

// The project's fictional US sandbox accounts (fake addresses). Never print these: redact() swaps each for its role.
export const ACCOUNTS = {
  secondlook: "secondlook-39d4c8@business.example.com",
  margaret: "margaret-39d4c8@personal.example.com",
  sarah: "sarah-39d4c8@personal.example.com",
  tom: "tom-39d4c8@personal.example.com",
  rosa: "rosa-39d4c8@personal.example.com",
  electric: "electric-39d4c8@business.example.com",
  pharmacy: "pharmacy-39d4c8@business.example.com",
  techsupport: "techsupport-39d4c8@personal.example.com",
};

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

async function readAnswer(res, started) {
  const text = await res.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { unparsed: text.slice(0, 500) };
    }
  }
  return {
    status: res.status,
    body,
    issue: body.details?.[0]?.issue ?? body.name ?? body.error,
    debugId: res.headers.get("paypal-debug-id") ?? body.debug_id,
    ms: Date.now() - started,
  };
}

// A network failure (no HTTP answer) comes back as status 0 so the gate records it instead of crashing.
async function call(url, init) {
  const started = Date.now();
  try {
    return await readAnswer(await fetch(url, init), started);
  } catch (err) {
    const code = err.cause?.code ?? err.name;
    return { status: 0, body: {}, issue: `NETWORK_ERROR ${code}`, debugId: undefined, ms: Date.now() - started };
  }
}

// Read-only call; returns PayPal's answer instead of throwing so gates can record error responses too.
export async function paypalGet(accessToken, path) {
  return call(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
}

// A PayPal-Request-Id: a UUID, 36 characters (PayPal's limit is 38). Generate it before the call and keep it for retries.
export function newRequestId() {
  return randomUUID();
}

// Every POST carries a caller-supplied PayPal-Request-Id (hard rule 4); there is deliberately no default.
// prefer: null leaves the Prefer header off (Payouts). Returns PayPal's answer instead of throwing.
export async function paypalPost(accessToken, path, body, requestId, { prefer = "return=representation" } = {}) {
  assertSandbox();
  if (typeof requestId !== "string" || requestId.length === 0 || requestId.length > 38) {
    throw new Error(`paypalPost ${path}: a PayPal-Request-Id of 1-38 characters is required (hard rule 4)`);
  }
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "PayPal-Request-Id": requestId,
  };
  if (prefer) headers.Prefer = prefer;
  const answer = await call(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ...answer, requestId };
}

// Replace every email address with its role name ("<sarah>"), or "<email>" if it isn't one of ours.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const ENCODED_EMAIL_RE = /[A-Za-z0-9._+-]+%40[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/gi;
const ROLE_BY_EMAIL = new Map(Object.entries(ACCOUNTS).map(([role, email]) => [email.toLowerCase(), `<${role}>`]));
const roleFor = (email) => ROLE_BY_EMAIL.get(email.toLowerCase()) ?? "<email>";

export function redact(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const out = text
    .replace(EMAIL_RE, roleFor)
    .replace(ENCODED_EMAIL_RE, (m) => roleFor(m.replace(/%40/i, "@")));
  return typeof value === "string" ? out : JSON.parse(out);
}

const RUNS_DIR = fileURLToPath(new URL("../../tmp/sandbox-runs/", import.meta.url));

// Save one call's answer, emails redacted, as tmp/sandbox-runs/<script>/<step>.json (tmp/ is gitignored).
export function saveRun(script, step, record) {
  const dir = `${RUNS_DIR}${script}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${step}.json`, `${JSON.stringify(redact({ saved_at: new Date().toISOString(), ...record }), null, 2)}\n`);
}

// Print a finding line, emails redacted.
export function say(...parts) {
  console.log(redact(parts.join(" ")));
}

function summary(step, method, path, r) {
  const state = r.body?.status ?? r.body?.batch_header?.batch_status ?? "";
  const problem =
    r.status >= 400 || r.status === 0 ? ` ${r.issue ?? ""}${r.body?.details?.[0]?.description ? ` "${r.body.details[0].description}"` : ""}` : "";
  const rid = r.requestId ? `; request id ${r.requestId}` : "";
  return `${step}: ${method} ${path} -> HTTP ${r.status} ${state}${problem} (${r.ms} ms${rid}; debug_id ${r.debugId ?? "none"})`;
}

// One gate run: a token, plus post/get that save every answer and print one short line each.
export async function startGate(script) {
  const { accessToken } = await getToken();
  return {
    async post(step, path, body, { requestId = newRequestId(), prefer } = {}) {
      const r = await paypalPost(accessToken, path, body, requestId, prefer === undefined ? {} : { prefer });
      saveRun(script, step, { method: "POST", path, request_id: requestId, http_status: r.status, debug_id: r.debugId, ms: r.ms, response: r.body });
      say(summary(step, "POST", path, r));
      return r;
    },
    async get(step, path, { quiet = false, save = true } = {}) {
      const r = await paypalGet(accessToken, path);
      if (save) saveRun(script, step, { method: "GET", path, http_status: r.status, debug_id: r.debugId, ms: r.ms, response: r.body });
      if (!quiet) say(summary(step, "GET", path, r));
      return r;
    },
  };
}

// Money as integer cents (hard rule 5); PayPal wants "84.00".
export function toValue(cents) {
  if (!Number.isInteger(cents) || cents < 0) throw new Error(`not a whole number of cents: ${cents}`);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function toCents(value) {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value).replace(/,/g, ""));
  if (!m) throw new Error(`not a money value: ${value}`);
  const cents = Number(m[2]) * 100 + Number((m[3] ?? "0").padEnd(2, "0"));
  return m[1] ? -cents : cents;
}

export const usd = (cents) => ({ currency_code: "USD", value: toValue(cents) });

// PayPal's published sandbox test Visa, with a fictional card holder and billing address. Sandbox gates only:
// the app itself must never collect or store card numbers.
export const TEST_CARD = {
  card: {
    number: "4111111111111111",
    expiry: "2030-12",
    security_code: "123",
    name: "Margaret Demo",
    billing_address: {
      address_line_1: "12 Example Lane",
      admin_area_2: "Columbus",
      admin_area_1: "OH",
      postal_code: "43004",
      country_code: "US",
    },
  },
};

// A card-funded order: with the test card it authorizes (or captures) at create, with no buyer approval step.
export function cardOrder({ intent, cents, description, customId, payeeEmail }) {
  const unit = { reference_id: customId, custom_id: customId, description, amount: usd(cents) };
  if (payeeEmail) unit.payee = { email_address: payeeEmail };
  return { intent, purchase_units: [unit], payment_source: TEST_CARD };
}

export const firstAuthorization = (order) => order?.purchase_units?.[0]?.payments?.authorizations?.[0];
export const firstCapture = (order) => order?.purchase_units?.[0]?.payments?.captures?.[0];

// Second Look's own USD balance (needs the Transaction search feature).
export async function getBalance(gate, step) {
  const r = await gate.get(step, "/v1/reporting/balances?currency_code=USD", { quiet: true });
  const b = (r.body.balances ?? []).find((x) => x.currency === "USD") ?? {};
  const out = {
    ok: r.status === 200,
    status: r.status,
    issue: r.issue,
    debugId: r.debugId,
    ms: r.ms,
    total: b.total_balance?.value,
    available: b.available_balance?.value,
    withheld: b.withheld_balance?.value,
    asOf: r.body.as_of_time,
    lastRefresh: r.body.last_refresh_time,
  };
  say(
    `${step}: balance HTTP ${out.status}${out.ok ? "" : ` ${out.issue}`} total ${out.total ?? "?"}, available ${out.available ?? "?"}, ` +
      `withheld ${out.withheld ?? "?"} (as_of ${out.asOf ?? "?"}, last_refresh ${out.lastRefresh ?? "?"}; ${out.ms} ms; debug_id ${out.debugId ?? "none"})`,
  );
  return out;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A compact UTC stamp for fixed test identifiers, e.g. 20261106T142233.
export function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").slice(0, 15);
}

export function verdict(pass, text) {
  say(`${pass ? "PASS" : "FAIL"}  ${text}`);
  return pass;
}
