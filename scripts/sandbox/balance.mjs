// Second Look's own USD balance (GET /v1/reporting/balances), plus the last few days of transaction search with each
// transaction's ending balance, to see how far the reporting data lags. Read-only.
// Run: node --env-file=.env scripts/sandbox/balance.mjs

import { getBalance, say, startGate } from "./lib.mjs";

const DAYS = 3;

try {
  const gate = await startGate("balance");
  await getBalance(gate, "balance");

  const end = new Date();
  const start = new Date(end.getTime() - DAYS * 86_400_000);
  const iso = (d) => `${d.toISOString().slice(0, 19)}Z`;
  const r = await gate.get(
    "transactions",
    `/v1/reporting/transactions?start_date=${iso(start)}&end_date=${iso(end)}&fields=transaction_info&page_size=100`,
  );
  const rows = (r.body.transaction_details ?? []).map((t) => t.transaction_info);
  say(`  ${rows.length} transactions in the last ${DAYS} days (last_refreshed_datetime ${r.body.last_refreshed_datetime ?? "?"})`);
  for (const t of rows.slice(-12)) {
    say(`  ${t.transaction_initiation_date} ${t.transaction_event_code} ${t.transaction_status} ${t.transaction_amount?.value} -> ending ${t.ending_balance?.value ?? "?"} (${t.transaction_id})`);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
