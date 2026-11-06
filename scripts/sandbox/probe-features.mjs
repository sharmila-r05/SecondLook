// Gate: are Invoicing, Vault and Transaction search actually usable by this app? Read-only GETs; 403 = not enabled.
// Run: node --env-file=.env scripts/sandbox/probe-features.mjs [--fresh]   (PayPal reuses a token until it expires, so its
// scope list can lag behind feature changes in the dashboard; these calls test the permission itself)

import { getToken, paypalGet } from "./lib.mjs";

const PROBES = [
  ["Invoicing", "/v2/invoicing/invoices?page=1&page_size=1"],
  ["Vault (save payment methods)", "/v3/vault/payment-tokens?customer_id=sl-probe-customer"],
  ["Transaction search (balance)", "/v1/reporting/balances?currency_code=USD"],
];

try {
  const { accessToken } = await getToken({ fresh: process.argv.includes("--fresh") });
  for (const [name, path] of PROBES) {
    const r = await paypalGet(accessToken, path);
    const verdict = r.status === 403 || r.status === 401 ? "NOT ENABLED" : r.status < 300 ? "works" : "reachable";
    console.log(`${name}: HTTP ${r.status} ${r.issue ?? ""} -> ${verdict} (${r.ms} ms, debug_id ${r.debugId ?? "none"})`);
    if (path.startsWith("/v1/reporting/balances") && r.status === 200) {
      for (const b of r.body.balances ?? []) {
        console.log(`  balance ${b.currency}: total ${b.total_balance?.value}, available ${b.available_balance?.value}`);
      }
    }
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
