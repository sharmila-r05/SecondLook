// Gate: Invoicing v2 for a sibling's share. Draft with a fixed invoice_number -> the same number again
// (DUPLICATE_INVOICE_NUMBER) -> search by number -> send without email -> read status and recipient_view_url -> remind
// the sent, unpaid invoice. Paying it as Sarah needs a buyer login: the URL is printed for the owner.
// Run: node --env-file=.env scripts/sandbox/invoice.mjs

import { ACCOUNTS, say, stamp, startGate, usd, verdict } from "./lib.mjs";

const SCRIPT = "invoice";

try {
  const gate = await startGate(SCRIPT);
  const number = `SL-GATE-${stamp()}`;
  say(`  invoice_number ${number}`);
  const body = {
    detail: {
      invoice_number: number,
      currency_code: "USD",
      note: "Your share of Margaret's care this week (gate test).",
      payment_term: { term_type: "DUE_ON_RECEIPT" },
    },
    invoicer: { business_name: "Second Look", email_address: ACCOUNTS.secondlook },
    primary_recipients: [{ billing_info: { name: { given_name: "Sarah" }, email_address: ACCOUNTS.sarah } }],
    items: [{ name: "Care for Margaret, week of Nov 2", quantity: "1", unit_amount: usd(7500), unit_of_measure: "QUANTITY" }],
  };

  const created = await gate.post("1-create-draft", "/v2/invoicing/invoices", body);
  const id = created.body.id;
  say(`  invoice ${id ?? "none"} ${created.body.status ?? created.issue}; total ${created.body.amount?.value ?? "?"}`);
  if (!id) process.exit(1);

  const dup = await gate.post("2-create-same-number", "/v2/invoicing/invoices", body);

  const found = await gate.post("3-search-by-number", "/v2/invoicing/search-invoices?page=1&page_size=10&total_required=true", { invoice_number: number });
  const hits = found.body.items ?? [];
  say(`  search: total_items ${found.body.total_items ?? "?"}; ids ${hits.map((i) => i.id).join(", ") || "none"}`);

  const sent = await gate.post("4-send-no-email", `/v2/invoicing/invoices/${id}/send`, { send_to_recipient: false, send_to_invoicer: false });
  const afterSend = await gate.get("5-read-after-send", `/v2/invoicing/invoices/${id}`);
  const meta = afterSend.body.detail?.metadata ?? {};
  say(`  status ${afterSend.body.status}; recipient_view_url ${meta.recipient_view_url ? "present" : "MISSING"}; invoicer_view_url ${meta.invoicer_view_url ? "present" : "missing"}`);

  const remind = await gate.post("6-remind", `/v2/invoicing/invoices/${id}/remind`, {
    subject: "A reminder: your share of Margaret's care",
    note: "Gate test reminder.",
    send_to_invoicer: false,
    send_to_recipient: true,
  });
  const afterRemind = await gate.get("7-read-after-remind", `/v2/invoicing/invoices/${id}`);
  const meta2 = afterRemind.body.detail?.metadata ?? {};
  say(`  after remind: status ${afterRemind.body.status}; metadata keys ${Object.keys(meta2).join(", ")}`);

  say("");
  verdict(created.status === 201 && created.body.status === "DRAFT", `draft created -> HTTP ${created.status} ${created.body.status} (${created.ms} ms)`);
  verdict(dup.status >= 400 && dup.issue === "DUPLICATE_INVOICE_NUMBER", `same number again -> HTTP ${dup.status} ${dup.issue}`);
  verdict(found.status === 200 && hits.length === 1 && hits[0].id === id, `search by number finds exactly this invoice`);
  verdict(sent.status < 300, `send (no email) -> HTTP ${sent.status}; status now ${afterSend.body.status}`);
  verdict(Boolean(meta.recipient_view_url), `recipient_view_url present`);
  verdict(remind.status < 300, `remind on a sent, unpaid invoice -> HTTP ${remind.status} ${remind.issue ?? ""}`);
  if (meta.recipient_view_url) say(`\nPay as Sarah (sandbox buyer login): ${meta.recipient_view_url}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
