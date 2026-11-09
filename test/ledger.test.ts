import { describe, expect, it } from "vitest";
import {
  type BillRow,
  buildLedger,
  type CarePeriodRow,
  dateRange,
  type EventRow,
  type LedgerInput,
  type PaymentRow,
  type ShareRow,
  weekHeading,
  weekOf,
} from "@/lib/ledger";

// November is Eastern Standard Time (UTC-5). "Now" is Monday 9 Nov 2026, 11:00 am in New York.
const NOW = new Date("2026-11-09T16:00:00Z");
const at = (iso: string) => new Date(iso);
const plain = (s: string) => s.replace(/⁠/g, "");

let seq = 0;
function payment(over: Partial<PaymentRow> & Pick<PaymentRow, "kind" | "createdAt">): PaymentRow {
  seq += 1;
  return {
    id: `pay-${seq}`,
    requestId: null,
    carePeriodId: null,
    shareId: null,
    orderId: null,
    authorizationId: null,
    captureId: null,
    payoutBatchId: null,
    invoiceId: null,
    paypalRequestId: `req-${seq}`,
    orderRequestId: null,
    amountCents: 0,
    status: "COMPLETED",
    ...over,
  };
}

function bill(over: Partial<BillRow> & Pick<BillRow, "id" | "status" | "createdAt">): BillRow {
  return { payee: "Hollowbrook Electric", amountCents: 8400, updatedAt: over.createdAt, decidedBy: null, rules: [], holdExpiresAt: null, ...over };
}

const RULES = [
  { id: "new_payee" as const, chip: "New payee", fact: "Tech Support Line isn’t on the family’s list" },
  { id: "over_limit" as const, chip: "Over $300 limit", fact: "$1,500.00 is over her $300.00 limit" },
];

/** One whole money flow of each kind, the way bills.ts and the weekly close write them. */
function input(): LedgerInput {
  const electricAt = at("2026-11-09T14:41:00Z"); // Mon 9:41 am
  const heldAt = at("2026-11-09T15:10:00Z"); // Mon 10:10 am
  const deniedAt = at("2026-11-09T15:30:00Z"); // Mon 10:30 am, held
  const deniedDecision = at("2026-11-09T15:34:00Z");
  const expiredAt = at("2026-11-04T19:00:00Z"); // Wed 4 Nov, 2:00 pm
  const approvedAt = at("2026-11-03T15:00:00Z"); // Tue 3 Nov
  const closeAt = at("2026-11-09T14:00:00Z"); // Mon 9:00 am

  const bills: BillRow[] = [
    bill({ id: "b-electric", status: "paid", createdAt: electricAt }),
    bill({ id: "b-held", status: "held", payee: "Tech Support Line", amountCents: 150000, createdAt: heldAt, rules: RULES, holdExpiresAt: at("2026-11-09T15:20:00Z") }),
    bill({ id: "b-denied", status: "voided", payee: "Tech Support Line", amountCents: 150000, createdAt: deniedAt, rules: RULES, decidedBy: "Sarah" }),
    bill({ id: "b-expired", status: "voided", payee: "Prize Office", amountCents: 50000, createdAt: expiredAt, rules: RULES, holdExpiresAt: at("2026-11-04T19:10:00Z") }),
    bill({ id: "b-approved", status: "paid", payee: "Roofer", amountCents: 45000, createdAt: approvedAt, rules: RULES, decidedBy: "Tom" }),
    bill({ id: "b-new", status: "new", createdAt: at("2026-11-09T15:50:00Z") }),
  ];

  const payments: PaymentRow[] = [
    payment({ kind: "authorization", requestId: "b-electric", orderId: "ORDER-E", authorizationId: "AUTH-E", orderRequestId: "oreq-e", amountCents: 8400, status: "CAPTURED", createdAt: electricAt }),
    payment({ kind: "capture", requestId: "b-electric", authorizationId: "AUTH-E", captureId: "CAP-E", amountCents: 8400, status: "COMPLETED", createdAt: electricAt }),
    payment({ kind: "payout", requestId: "b-electric", payoutBatchId: "BATCH-E", amountCents: 8400, status: "SUCCESS", createdAt: electricAt }),
    payment({ kind: "authorization", requestId: "b-held", orderId: "ORDER-H", authorizationId: "AUTH-H", amountCents: 150000, status: "CREATED", createdAt: heldAt }),
    payment({ kind: "authorization", requestId: "b-denied", orderId: "ORDER-D", authorizationId: "AUTH-D", amountCents: 150000, status: "VOIDED", createdAt: deniedAt }),
    payment({ kind: "void", requestId: "b-denied", authorizationId: "AUTH-D", amountCents: 150000, status: "VOIDED", createdAt: deniedDecision }),
    payment({ kind: "authorization", requestId: "b-expired", orderId: "ORDER-X", authorizationId: "AUTH-X", amountCents: 50000, status: "VOIDED", createdAt: expiredAt }),
    payment({ kind: "void", requestId: "b-expired", authorizationId: "AUTH-X", amountCents: 50000, status: "VOIDED", createdAt: at("2026-11-04T19:11:00Z") }),
    payment({ kind: "authorization", requestId: "b-approved", orderId: "ORDER-A", authorizationId: "AUTH-A", amountCents: 45000, status: "CAPTURED", createdAt: approvedAt }),
    payment({ kind: "capture", requestId: "b-approved", captureId: "CAP-A", amountCents: 45000, status: "COMPLETED", createdAt: at("2026-11-03T15:05:00Z") }),
    payment({ kind: "payout", requestId: "b-approved", payoutBatchId: "BATCH-A", amountCents: 45000, status: "PENDING", createdAt: at("2026-11-03T15:05:00Z") }),
    payment({ kind: "payout", carePeriodId: "cp-1", payoutBatchId: "BATCH-ROSA", amountCents: 15000, status: "SUCCESS", createdAt: closeAt }),
    payment({ kind: "invoice", carePeriodId: "cp-1", shareId: "s-sarah", invoiceId: "INV-S", amountCents: 7500, status: "PAID", createdAt: closeAt }),
    payment({ kind: "invoice", carePeriodId: "cp-1", shareId: null, invoiceId: "INV-T", amountCents: 7500, status: "UNPAID", createdAt: closeAt }),
  ];

  const periods: CarePeriodRow[] = [
    { id: "cp-1", startDate: "2026-11-02", endDate: "2026-11-08", totalCents: 15000, status: "closed", visits: 3, closedBy: "Sarah", closedAt: closeAt, senderBatchId: "sl-care-cp-1" },
  ];
  const shares: ShareRow[] = [
    { id: "s-sarah", carePeriodId: "cp-1", member: "Sarah", amountCents: 7500, status: "paid", invoiceNumber: "SL-CP1-SARAH", invoiceId: "INV-S" },
    { id: "s-tom", carePeriodId: "cp-1", member: "Tom", amountCents: 7500, status: "sent", invoiceNumber: "SL-CP1-TOM", invoiceId: "INV-T" },
  ];
  const events: EventRow[] = [
    { type: "request:denied", payload: { requestId: "b-denied", by: "Sarah" }, at: deniedDecision },
    { type: "request:expired", payload: { requestId: "b-expired" }, at: at("2026-11-04T19:10:30Z") },
    { type: "request:approved", payload: { requestId: "b-approved", by: "Tom" }, at: at("2026-11-03T15:04:00Z") },
    { type: "paypal:invoice_paid", payload: { shareId: "s-sarah", to: "Sarah" }, at: at("2026-11-09T14:30:00Z") },
  ];
  return { aide: "Rosa", bills, payments, periods, shares, events };
}

const block = (ledger: ReturnType<typeof buildLedger>, id: string) => {
  const found = ledger.weeks.flatMap((w) => w.blocks).find((b) => b.id === id);
  if (!found) throw new Error(`no block ${id}`);
  return found;
};

describe("weeks in Margaret's time zone", () => {
  it("puts Sunday night in New York in the week that started on Monday", () => {
    expect(weekOf(at("2026-11-09T04:30:00Z"))).toBe("2026-11-02"); // Sun 8 Nov, 11:30 pm EST
    expect(weekOf(at("2026-11-09T05:30:00Z"))).toBe("2026-11-09"); // Mon 9 Nov, 12:30 am EST
  });

  it("names a range within a month, across a month, and a single day", () => {
    expect(plain(dateRange("2026-11-02", "2026-11-08"))).toBe("Nov 2–8");
    expect(plain(dateRange("2026-10-26", "2026-11-01"))).toBe("Oct 26–Nov 1");
    expect(dateRange("2026-11-02", "2026-11-02")).toBe("Nov 2");
  });

  it("calls the weeks this week, last week, then by their dates", () => {
    expect(plain(weekHeading("2026-11-09", "2026-11-09"))).toBe("This week, Nov 9–15");
    expect(plain(weekHeading("2026-11-02", "2026-11-09"))).toBe("Last week, Nov 2–8");
    expect(plain(weekHeading("2026-10-26", "2026-11-09"))).toBe("Oct 26–Nov 1");
  });
});

describe("buildLedger: the quilt", () => {
  const ledger = buildLedger(input(), NOW);

  it("rows the weeks newest first, each block in time order, and leaves out a bill Margaret hasn't approved", () => {
    expect(ledger.weeks.map((w) => w.id)).toEqual(["2026-11-09", "2026-11-02"]);
    expect(ledger.weeks[0]?.current).toBe(true);
    expect(ledger.weeks[0]?.blocks.map((b) => b.id)).toEqual(["care:cp-1", "share:s-sarah", "share:s-tom", "bill:b-electric", "bill:b-held", "bill:b-denied"]);
    expect(ledger.weeks[1]?.blocks.map((b) => b.id)).toEqual(["bill:b-approved", "bill:b-expired"]);
  });

  it("shows a normal bill as Margaret's, paid, with every PayPal step and its IDs", () => {
    const b = block(ledger, "bill:b-electric");
    expect(b).toMatchObject({ fabric: "margaret", who: "Margaret", tone: "settled", label: "Paid", amount: "$84.00", when: "Mon 9:41 am" });
    expect(b.flow).toBe("Orders v2 AUTHORIZE, Payments v2 capture, then Payouts v1");
    expect(b.steps.map((s) => [s.call, s.paypalId, s.requestId])).toEqual([
      ["Orders v2 · create order (AUTHORIZE)", "ORDER-E", "oreq-e"],
      ["Orders v2 · authorize", "AUTH-E", expect.stringMatching(/^req-/)],
      ["Payments v2 · capture authorization", "CAP-E", expect.stringMatching(/^req-/)],
      ["Payouts v1 · create batch payout", "BATCH-E", expect.stringMatching(/^req-/)],
    ]);
  });

  it("bastes a held payment, says why, and opens the panel on it", () => {
    const b = block(ledger, "bill:b-held");
    expect(b).toMatchObject({ tone: "waiting", state: "held", label: "Held for a second look", why: ["New payee", "Over $300 limit"] });
    expect(b.story.at(-1)?.text).toBe("If nobody answers, the hold cancels itself at 10:20 am.");
    expect(ledger.selected).toBe("bill:b-held");
  });

  it("keeps a cancelled hold in Margaret's teal, names who said no, and says the money never left", () => {
    const b = block(ledger, "bill:b-denied");
    expect(b).toMatchObject({ fabric: "margaret", who: "Margaret", tone: "cancelled", state: "cancelled", label: "Cancelled · nothing paid" });
    expect(b.outcome).toBe("Held and cancelled. The money never left.");
    expect(b.story.map((l) => l.who)).toEqual(["Margaret", "Second Look", "Sarah", "Second Look"]);
    expect(b.story[2]?.text).toBe("Sarah said no on Monday at 10:34 am.");
    expect(b.flow).toBe("Orders v2 AUTHORIZE, then Payments v2 void");
  });

  it("opens on this week's cancelled hold once nothing is waiting, else on the latest move", () => {
    const answered = input();
    answered.bills = answered.bills.filter((b) => b.id !== "b-held");
    expect(buildLedger(answered, NOW).selected).toBe("bill:b-denied");
    answered.bills = answered.bills.filter((b) => b.id !== "b-denied");
    expect(buildLedger(answered, NOW).selected).toBe("bill:b-electric");
  });

  it("tells a hold that timed out apart from one somebody refused", () => {
    const b = block(ledger, "bill:b-expired");
    expect(b).toMatchObject({ tone: "cancelled", label: "Cancelled · nothing paid" });
    expect(b.story.some((l) => l.text === "Nobody answered by 2:10 pm, so the hold cancelled itself.")).toBe(true);
  });

  it("shows an approved payment as paying until the payout succeeds", () => {
    const b = block(ledger, "bill:b-approved");
    expect(b).toMatchObject({ tone: "processing", label: "Tom said yes — paid", outcome: "Approved by Tom, paid." });
    const done = input();
    done.payments = done.payments.map((p) => (p.payoutBatchId === "BATCH-A" ? { ...p, status: "SUCCESS" } : p));
    expect(block(buildLedger(done, NOW), "bill:b-approved").tone).toBe("settled");
  });

  it("gives Rosa's pay her colour and each share its sibling's, and sews who closed the week onto the row", () => {
    expect(block(ledger, "care:cp-1")).toMatchObject({ fabric: "rosa", title: "Rosa’s pay", label: "Paid for 3 visits", tone: "settled", amount: "$150.00" });
    expect(block(ledger, "care:cp-1").steps[0]?.ours).toEqual({ label: "sender_batch_id", value: "sl-care-cp-1" });
    expect(block(ledger, "share:s-sarah")).toMatchObject({ fabric: "sarah", label: "Paid", tone: "settled", flow: "Invoicing v2 create, send, then paid" });
    expect(block(ledger, "share:s-sarah").story.at(-1)?.text).toBe("Sarah paid it on PayPal on Monday at 9:30 am.");
    expect(block(ledger, "share:s-tom")).toMatchObject({ fabric: "tom", label: "Invoice sent", tone: "processing", state: "sent" });
    // Tom's invoice row has no share id (before the share_id column): it's matched by its invoice ID.
    expect(block(ledger, "share:s-tom").steps[0]).toMatchObject({ paypalId: "INV-T", status: "UNPAID", ours: { label: "Invoice number", value: "SL-CP1-TOM" } });
    expect(ledger.weeks[0]?.closedBy).toEqual({ who: "Sarah", fabric: "sarah", when: "Mon 9:00 am" });
  });

  it("falls back to the week:closed event when the period row doesn't say who closed it", () => {
    const old = input();
    old.periods = old.periods.map((p) => ({ ...p, closedBy: null, visits: null, closedAt: null }));
    old.events.push({ type: "week:closed", payload: { carePeriodId: "cp-1", visits: 2, by: "Tom" }, at: at("2026-11-09T13:00:00Z") });
    const rebuilt = buildLedger(old, NOW);
    expect(block(rebuilt, "care:cp-1").label).toBe("Paid for 2 visits");
    expect(rebuilt.weeks[0]?.closedBy?.who).toBe("Tom");
  });

  it("always shows this week, even before anything has moved", () => {
    const empty = buildLedger({ aide: "Rosa", bills: [], payments: [], periods: [], shares: [], events: [] }, NOW);
    expect(empty.weeks).toHaveLength(1);
    expect(empty.weeks[0]).toMatchObject({ id: "2026-11-09", current: true, blocks: [] });
    expect(empty.selected).toBeNull();
    expect(empty.steps).toEqual([]);
  });
});

describe("buildLedger: every PayPal step", () => {
  const { steps } = buildLedger(input(), NOW);

  it("lists every payments row, newest first", () => {
    expect(steps).toHaveLength(14);
    const times = steps.map((s) => s.at);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it("names who set each call going", () => {
    const row = (paypalId: string, kind?: string) => steps.find((s) => s.paypalId === paypalId && (!kind || s.call.includes(kind)));
    expect(row("AUTH-E", "authorize")).toMatchObject({ who: "Margaret", what: "Hold for Hollowbrook Electric", call: "Orders v2 · authorize" });
    expect(row("CAP-A")).toMatchObject({ who: "Tom", what: "Capture for Roofer" });
    expect(row("AUTH-D", "void")).toMatchObject({ who: "Sarah", fabric: "sarah", what: "Void hold for Tech Support Line" });
    expect(row("AUTH-X", "void")).toMatchObject({ who: "Second Look", fabric: "plum" });
    expect(row("BATCH-ROSA")).toMatchObject({ who: "Sarah", what: "Payout to Rosa", amount: "$150.00" });
    expect(row("INV-T")).toMatchObject({ what: "Invoice to Tom", status: "UNPAID" });
  });

  it("sends the browser no emails", () => {
    expect(JSON.stringify(buildLedger(input(), NOW))).not.toContain("@");
  });
});
