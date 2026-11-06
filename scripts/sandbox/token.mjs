// Gate: the app mints a sandbox token, and its scopes cover every feature Second Look uses.
// Run: node --env-file=.env scripts/sandbox/token.mjs [--fresh]   (prints scope names only, never the token)

import { getToken } from "./lib.mjs";

const FEATURES = [
  ["Orders: authorize and capture", /\/payments\/payment\/authcapture$/],
  ["Refunds", /\/payments\/refund$/],
  ["Invoicing", /\/services\/invoicing$/],
  ["Payouts", /\/payments\/payouts$/],
  ["Vault (save payment methods)", /\/vault\/payment-tokens\/readwrite$/],
  ["Transaction search (balance)", /\/reporting\/search\/read$/],
  ["Webhooks", /\/applications\/webhooks$/],
];

try {
  const { expiresIn, scopes, ms } = await getToken({ fresh: process.argv.includes("--fresh") });
  console.log(`Token minted in ${ms} ms; expires_in ${expiresIn} s (${(expiresIn / 3600).toFixed(1)} h).\n`);
  for (const [name, pattern] of FEATURES) {
    console.log(`${scopes.some((s) => pattern.test(s)) ? "yes" : "NO "}  ${name}`);
  }
  console.log(`\nAll ${scopes.length} scopes:`);
  for (const s of scopes) console.log(`  ${s}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
