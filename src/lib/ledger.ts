// The shared ledger, as a quilt: one row per week (Monday to Sunday, Margaret's time zone), one block per money move,
// each in the fabric of the person who set it going. A block keeps its place as its state changes: a held payment's
// block becomes "cancelled" or "paid", an invoice's becomes "paid". Every block names the PayPal steps behind it, and
// "Every PayPal step" lists each payments row. Pure: the rows come from ledger-data.ts, so this is tested without a
// database. Nothing here carries an email or a secret; it is all sent to the browser.

import { formatUsd } from "@/lib/money";
import type { RuleHit } from "@/lib/risk";
import type { PaymentRequestState } from "@/lib/states";
import { addDays, formatTime, localDate, PARENT_TIME_ZONE, weekdayIndex } from "@/lib/time";

// ---------------------------------------------------------------------------------------------------------------
// What the database gives us

export type PaymentKind = "authorization" | "capture" | "void" | "payout" | "invoice" | "refund";

export interface BillRow {
  id: string;
  payee: string;
  amountCents: number;
  status: PaymentRequestState;
  createdAt: Date;
  updatedAt: Date;
  decidedBy: string | null;
  rules: RuleHit[];
  holdExpiresAt: Date | null;
}

export interface PaymentRow {
  id: string;
  kind: PaymentKind;
  requestId: string | null;
  carePeriodId: string | null;
  shareId: string | null;
  orderId: string | null;
  authorizationId: string | null;
  captureId: string | null;
  payoutBatchId: string | null;
  invoiceId: string | null;
  paypalRequestId: string;
  orderRequestId: string | null;
  amountCents: number;
  status: string;
  createdAt: Date;
}

export interface CarePeriodRow {
  id: string;
  startDate: string;
  endDate: string;
  totalCents: number;
  status: string;
  visits: number | null;
  closedBy: string | null;
  closedAt: Date | null;
  senderBatchId: string | null;
}

export interface ShareRow {
  id: string;
  carePeriodId: string;
  member: string;
  amountCents: number;
  status: "pending" | "sent" | "paid";
  invoiceNumber: string | null;
  invoiceId: string | null;
}

export interface EventRow {
  type: string;
  payload: Record<string, unknown>;
  at: Date;
}

export interface LedgerInput {
  aide: string;
  bills: BillRow[];
  payments: PaymentRow[];
  periods: CarePeriodRow[];
  shares: ShareRow[];
  events: EventRow[];
}

// ---------------------------------------------------------------------------------------------------------------
// What the screen shows

/** One fabric per person; Second Look's own plum for what nobody in the family did (a hold timing out). */
export type Fabric = "margaret" | "sarah" | "tom" | "rosa" | "plum";

/** settled: done. waiting: on a family member. processing: PayPal is finishing it. cancelled: a hold let go. */
export type BlockTone = "settled" | "waiting" | "processing" | "cancelled";

export interface StoryLine {
  who: string;
  fabric: Fabric;
  text: string;
}

export interface LedgerStep {
  /** "Orders v2 · create order (AUTHORIZE)" */
  call: string;
  /** What the ID is: "Order", "Authorization", "Capture", "Payout batch", "Invoice". */
  idLabel: string;
  paypalId: string | null;
  status: string | null;
  requestId: string | null;
  /** A key Second Look fixed before the call, so a retry can't pay twice: a sender_batch_id or an invoice number. */
  ours: { label: string; value: string } | null;
}

export interface LedgerBlock {
  id: string;
  kind: "bill" | "care" | "share";
  who: string;
  fabric: Fabric;
  title: string;
  label: string;
  amountCents: number;
  amount: string;
  at: string;
  /** "Mon 10:41 am" */
  when: string;
  tone: BlockTone;
  /** One line for the detail panel's headline: "Held and cancelled. The money never left." */
  outcome: string;
  story: StoryLine[];
  /** The rule chips for a payment that was held. */
  why: string[];
  /** "Orders v2 AUTHORIZE → Payments v2 void" */
  flow: string;
  steps: LedgerStep[];
}

export interface LedgerWeek {
  /** The Monday, "2026-11-02". */
  id: string;
  heading: string;
  current: boolean;
  closedBy: { who: string; fabric: Fabric; when: string } | null;
  blocks: LedgerBlock[];
}

export interface StepRow {
  id: string;
  at: string;
  when: string;
  who: string;
  fabric: Fabric;
  what: string;
  call: string;
  amountCents: number;
  amount: string;
  paypalId: string;
  status: string;
  requestId: string;
}

export interface Ledger {
  weeks: LedgerWeek[];
  steps: StepRow[];
  /** The block the detail panel opens on: one waiting on family, else this week's cancelled hold, else the latest. */
  selected: string | null;
}

// ---------------------------------------------------------------------------------------------------------------
// Words and dates

const FABRICS: Record<string, Fabric> = { Margaret: "margaret", Sarah: "sarah", Tom: "tom", Rosa: "rosa" };

export function fabricOf(name: string | null | undefined): Fabric {
  return (name && FABRICS[name]) || "plum";
}

const SECOND_LOOK = "Second Look";
const WEEKDAY_SHORT = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: PARENT_TIME_ZONE });
const WEEKDAY_LONG = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: PARENT_TIME_ZONE });
const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: PARENT_TIME_ZONE });
const MONTH_DAY_UTC = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Mon 10:41 am" */
export function blockWhen(at: Date): string {
  return `${WEEKDAY_SHORT.format(at)} ${formatTime(at)}`;
}

/** "Monday at 10:41 am" */
function said(at: Date): string {
  return `${WEEKDAY_LONG.format(at)} at ${formatTime(at)}`;
}

/** "Nov 9, 10:41 am" */
function stamp(at: Date): string {
  return `${MONTH_DAY.format(at)}, ${formatTime(at)}`;
}

/** The Monday of the week `at` falls in, in Margaret's time zone: "2026-11-02". */
export function weekOf(at: Date): string {
  return addDays(localDate(at), -weekdayIndex(at));
}

// An en dash held to its neighbours by word joiners, so "Nov 2–8" never breaks across lines.
const DASH = "⁠–⁠";
// "Sarah said no — hold cancelled": the em dash stays on the first line, never starts the next.
const THEN = " — ";

/** "Nov 2–8", or "Oct 26–Nov 1" across a month; one day is just "Nov 2". Dates are "2026-11-02". */
export function dateRange(start: string, end: string): string {
  const a = MONTH_DAY_UTC.format(new Date(`${start}T00:00:00Z`));
  if (start === end) return a;
  const b = MONTH_DAY_UTC.format(new Date(`${end}T00:00:00Z`));
  const [aMonth] = a.split(" ");
  const [bMonth, bDay] = b.split(" ");
  return aMonth === bMonth ? `${a}${DASH}${bDay}` : `${a}${DASH}${bMonth} ${bDay}`;
}

/** The Monday-to-Sunday week starting on `monday`. */
export function weekRange(monday: string): string {
  return dateRange(monday, addDays(monday, 6));
}

export function weekHeading(monday: string, thisMonday: string): string {
  const range = weekRange(monday);
  if (monday === thisMonday) return `This week, ${range}`;
  if (monday === addDays(thisMonday, -7)) return `Last week, ${range}`;
  return range;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------------------------------------------
// PayPal steps

// A payouts row is "paying" until PayPal answers, then the batch status: PENDING or PROCESSING, then SUCCESS.
const PAYOUT_SETTLED = new Set(["SUCCESS"]);
const PAYOUT_IN_FLIGHT = new Set(["paying", "PENDING", "PROCESSING"]);

function stepsFor(rows: PaymentRow[], ours: { senderBatchId?: string | null; invoiceNumber?: string | null } = {}): LedgerStep[] {
  const steps: LedgerStep[] = [];
  for (const row of rows) {
    switch (row.kind) {
      case "authorization":
        steps.push({
          call: "Orders v2 · create order (AUTHORIZE)",
          idLabel: "Order",
          paypalId: row.orderId,
          status: row.authorizationId ? null : row.status,
          requestId: row.orderRequestId,
          ours: null,
        });
        if (row.authorizationId) {
          steps.push({ call: "Orders v2 · authorize", idLabel: "Authorization", paypalId: row.authorizationId, status: row.status, requestId: row.paypalRequestId, ours: null });
        }
        break;
      case "capture":
        steps.push({ call: "Payments v2 · capture authorization", idLabel: "Capture", paypalId: row.captureId, status: row.status, requestId: row.paypalRequestId, ours: null });
        break;
      case "void":
        steps.push({ call: "Payments v2 · void authorization", idLabel: "Authorization", paypalId: row.authorizationId, status: row.status, requestId: row.paypalRequestId, ours: null });
        break;
      case "payout":
        steps.push({
          call: "Payouts v1 · create batch payout",
          idLabel: "Payout batch",
          paypalId: row.payoutBatchId,
          status: row.status,
          requestId: row.paypalRequestId,
          ours: ours.senderBatchId ? { label: "sender_batch_id", value: ours.senderBatchId } : null,
        });
        break;
      case "invoice":
        steps.push({
          call: "Invoicing v2 · create and send invoice",
          idLabel: "Invoice",
          paypalId: row.invoiceId,
          status: row.status,
          requestId: row.paypalRequestId,
          ours: ours.invoiceNumber ? { label: "Invoice number", value: ours.invoiceNumber } : null,
        });
        break;
      case "refund":
        steps.push({ call: "Payments v2 · refund capture", idLabel: "Refund", paypalId: row.captureId, status: row.status, requestId: row.paypalRequestId, ours: null });
        break;
    }
  }
  return steps;
}

const FLOW: Record<PaymentKind, string> = {
  authorization: "Orders v2 AUTHORIZE",
  capture: "Payments v2 capture",
  void: "Payments v2 void",
  payout: "Payouts v1",
  invoice: "Invoicing v2",
  refund: "Payments v2 refund",
};

const KIND_ORDER: Record<PaymentKind, number> = { authorization: 0, capture: 1, void: 1, payout: 2, invoice: 3, refund: 4 };

function flowOf(rows: PaymentRow[]): string {
  const kinds = [...new Set(rows.map((r) => r.kind))].sort((a, b) => KIND_ORDER[a] - KIND_ORDER[b]);
  return kinds.map((k) => FLOW[k]).join(" → ");
}

// ---------------------------------------------------------------------------------------------------------------
// Events

function eventFor(events: EventRow[], type: string, key: string, value: string): EventRow | undefined {
  return events.find((e) => e.type === type && e.payload[key] === value);
}

// ---------------------------------------------------------------------------------------------------------------
// Blocks

function billBlock(bill: BillRow, rows: PaymentRow[], events: EventRow[]): LedgerBlock | null {
  // "new": Margaret hasn't approved it on PayPal yet, so nothing is held and nothing has moved.
  if (bill.status === "new") return null;
  const amount = formatUsd(bill.amountCents);
  const held = bill.rules.length > 0;
  const decider = bill.decidedBy;
  const decidedEvent = eventFor(events, bill.status === "denied" || bill.status === "voided" ? "request:denied" : "request:approved", "requestId", bill.id);
  const decidedAt = decidedEvent?.at ?? bill.updatedAt;
  const payout = rows.find((r) => r.kind === "payout");
  const paidOut = payout ? PAYOUT_SETTLED.has(payout.status) : false;

  const story: StoryLine[] = [];
  const margaret = (text: string): StoryLine => ({ who: "Margaret", fabric: "margaret", text });
  const family = (text: string): StoryLine => ({ who: decider ?? SECOND_LOOK, fabric: fabricOf(decider), text });
  const system = (text: string): StoryLine => ({ who: SECOND_LOOK, fabric: "plum", text });

  if (held) {
    story.push(margaret(`Margaret asked to pay ${bill.payee} ${amount} on ${said(bill.createdAt)}.`));
    story.push(system("PayPal held the money for a second look from Sarah or Tom."));
  } else {
    story.push(margaret(`Margaret paid ${bill.payee} ${amount} on ${said(bill.createdAt)}.`));
  }

  let tone: BlockTone;
  let label: string;
  let outcome: string;
  switch (bill.status) {
    case "approved_auto":
      tone = "processing";
      label = "Paying";
      outcome = "PayPal is taking the payment now.";
      story.push(system(`A usual bill to a payee the family knows, so it went straight through.`));
      break;
    case "held":
      tone = "waiting";
      label = "Held for a second look";
      outcome = "Held, not taken. Waiting for Sarah or Tom.";
      if (bill.holdExpiresAt) story.push(system(`If nobody answers, the hold cancels itself at ${formatTime(bill.holdExpiresAt)}.`));
      break;
    case "approved_by_family":
      tone = "processing";
      label = `${decider ?? "Family"} said yes${THEN}paying`;
      outcome = `Approved by ${decider ?? "family"}, paying now.`;
      story.push(family(`${decider ?? "Family"} approved it on ${said(decidedAt)}.`));
      break;
    case "paid":
      tone = paidOut ? "settled" : "processing";
      if (decider) {
        label = `${decider} said yes${THEN}paid`;
        outcome = `Approved by ${decider}, paid.`;
        story.push(family(`${decider} approved it on ${said(decidedAt)}.`));
        story.push(system(`The hold was captured and paid to ${bill.payee}.`));
      } else {
        label = "Paid";
        outcome = `Paid to ${bill.payee}.`;
        story.push(system("A usual bill to a payee the family knows, so it went straight through."));
      }
      break;
    case "denied":
    case "voided":
    case "expired": {
      tone = "cancelled";
      const expired = bill.status === "expired" || !decider;
      if (expired) {
        const at = eventFor(events, "request:expired", "requestId", bill.id)?.at ?? bill.holdExpiresAt ?? bill.updatedAt;
        label = `No answer${THEN}hold cancelled`;
        story.push(system(`Nobody answered by ${formatTime(at)}, so the hold cancelled itself.`));
      } else {
        label = `${decider} said no${THEN}hold cancelled`;
        story.push(family(`${decider} said no on ${said(decidedAt)}.`));
      }
      const voided = bill.status === "voided" || rows.some((r) => r.kind === "void" && r.status === "VOIDED");
      outcome = voided ? "Held and cancelled. The money never left." : "Cancelling the hold. The money never left.";
      story.push(system(voided ? "PayPal voided the hold. Nothing was paid." : "PayPal is voiding the hold. Nothing was paid."));
      break;
    }
  }

  return {
    id: `bill:${bill.id}`,
    kind: "bill",
    who: "Margaret",
    fabric: "margaret",
    title: bill.payee,
    label,
    amountCents: bill.amountCents,
    amount,
    at: bill.createdAt.toISOString(),
    when: blockWhen(bill.createdAt),
    tone,
    outcome,
    story,
    why: bill.rules.map((r) => r.chip),
    flow: flowOf(rows),
    steps: stepsFor(rows),
  };
}

function closedAt(period: CarePeriodRow, events: EventRow[], rows: PaymentRow[]): Date | null {
  return period.closedAt ?? eventFor(events, "week:closed", "carePeriodId", period.id)?.at ?? rows[0]?.createdAt ?? null;
}

function closer(period: CarePeriodRow, events: EventRow[]): string | null {
  if (period.closedBy) return period.closedBy;
  const by = eventFor(events, "week:closed", "carePeriodId", period.id)?.payload.by;
  return typeof by === "string" ? by : null;
}

function visitsIn(period: CarePeriodRow, events: EventRow[]): number | null {
  if (period.visits !== null) return period.visits;
  const visits = eventFor(events, "week:closed", "carePeriodId", period.id)?.payload.visits;
  return typeof visits === "number" ? visits : null;
}

function closeLine(period: CarePeriodRow, events: EventRow[], aide: string, at: Date): StoryLine {
  const by = closer(period, events);
  const visits = visitsIn(period, events);
  const came = visits === null ? "" : `: ${aide} came ${plural(visits, "time", "times")}, ${dateRange(period.startDate, period.endDate)}`;
  return { who: by ?? SECOND_LOOK, fabric: fabricOf(by), text: `${by ?? "The family"} closed the week on ${said(at)}${came}.` };
}

function careBlock(period: CarePeriodRow, rows: PaymentRow[], events: EventRow[], aide: string): LedgerBlock | null {
  const payout = rows.find((r) => r.kind === "payout");
  const at = payout?.createdAt ?? closedAt(period, events, rows);
  if (!payout || !at) return null;
  const visits = visitsIn(period, events);
  const forVisits = visits === null ? "" : ` for ${plural(visits, "visit", "visits")}`;
  const settled = PAYOUT_SETTLED.has(payout.status);
  const failed = !settled && !PAYOUT_IN_FLIGHT.has(payout.status);
  const amount = formatUsd(payout.amountCents);
  const story = [closeLine(period, events, aide, closedAt(period, events, rows) ?? at)];
  story.push({
    who: SECOND_LOOK,
    fabric: "plum",
    text: settled
      ? `Second Look paid ${aide} ${amount} from its PayPal balance.`
      : failed
        ? `PayPal didn't finish paying ${aide}; it will be tried again.`
        : `Second Look is paying ${aide} ${amount} from its PayPal balance.`,
  });
  return {
    id: `care:${period.id}`,
    kind: "care",
    who: aide,
    fabric: fabricOf(aide),
    title: `${aide}’s pay`,
    label: settled ? `Paid${forVisits}` : `Paying${forVisits}`,
    amountCents: payout.amountCents,
    amount,
    at: at.toISOString(),
    when: blockWhen(at),
    tone: settled ? "settled" : "processing",
    outcome: settled ? `${aide} has been paid.` : `Paying ${aide} now.`,
    story,
    why: [],
    flow: flowOf([payout]),
    steps: stepsFor([payout], { senderBatchId: period.senderBatchId }),
  };
}

function shareBlock(share: ShareRow, period: CarePeriodRow | undefined, rows: PaymentRow[], events: EventRow[], aide: string): LedgerBlock | null {
  const invoice = rows.find((r) => r.kind === "invoice");
  const at = invoice?.createdAt ?? (period ? closedAt(period, events, rows) : null);
  if (!at) return null;
  const amount = formatUsd(share.amountCents);
  const story: StoryLine[] = [];
  if (period) {
    story.push(closeLine(period, events, aide, closedAt(period, events, rows) ?? at));
    story.push({ who: SECOND_LOOK, fabric: "plum", text: `${share.member}’s share of ${aide}’s ${formatUsd(period.totalCents)} is ${amount}.` });
  }
  const sent = eventFor(events, "paypal:invoice_sent", "shareId", share.id);
  const paid = eventFor(events, "paypal:invoice_paid", "shareId", share.id);
  const number = share.invoiceNumber ? ` ${share.invoiceNumber}` : "";
  if (share.status !== "pending") {
    story.push({ who: SECOND_LOOK, fabric: "plum", text: `PayPal sent ${share.member} invoice${number} on ${said(sent?.at ?? at)}.` });
  }
  if (share.status === "paid") {
    story.push({
      who: share.member,
      fabric: fabricOf(share.member),
      text: paid ? `${share.member} paid it on PayPal on ${said(paid.at)}.` : `${share.member} paid it on PayPal.`,
    });
  }
  const tone: BlockTone = share.status === "paid" ? "settled" : share.status === "sent" ? "waiting" : "processing";
  return {
    id: `share:${share.id}`,
    kind: "share",
    who: share.member,
    fabric: fabricOf(share.member),
    title: `${share.member}’s share`,
    label: share.status === "paid" ? "Paid" : share.status === "sent" ? "Invoice sent" : "Sending invoice",
    amountCents: share.amountCents,
    amount,
    at: at.toISOString(),
    when: blockWhen(at),
    tone,
    outcome:
      share.status === "paid"
        ? `${share.member} paid their share.`
        : share.status === "sent"
          ? `Invoice sent. Waiting for ${share.member} to pay it.`
          : "Sending the invoice.",
    story,
    why: [],
    flow: invoice ? (share.status === "paid" ? "Invoicing v2 create → send → paid" : "Invoicing v2 create → send") : "Invoicing v2",
    steps: stepsFor(invoice ? [invoice] : [], { invoiceNumber: share.invoiceNumber }),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The table

const STEP_WHAT: Record<PaymentKind, (subject: string) => string> = {
  authorization: (s) => `Hold for ${s}`,
  capture: (s) => `Capture for ${s}`,
  void: (s) => `Void hold for ${s}`,
  payout: (s) => `Payout to ${s}`,
  invoice: (s) => `Invoice to ${s}`,
  refund: (s) => `Refund from ${s}`,
};

const STEP_CALL: Record<PaymentKind, string> = {
  authorization: "Orders v2 · authorize",
  capture: "Payments v2 · capture",
  void: "Payments v2 · void",
  payout: "Payouts v1 · create",
  invoice: "Invoicing v2 · send",
  refund: "Payments v2 · refund",
};

function paypalIdOf(row: PaymentRow): string | null {
  switch (row.kind) {
    case "authorization":
      return row.authorizationId ?? row.orderId;
    case "capture":
      return row.captureId;
    case "void":
      return row.authorizationId;
    case "payout":
      return row.payoutBatchId;
    case "invoice":
      return row.invoiceId;
    case "refund":
      return row.captureId;
  }
}

function stepRow(row: PaymentRow, input: LedgerInput): StepRow {
  let subject = "";
  let who: string = SECOND_LOOK;
  if (row.requestId) {
    const bill = input.bills.find((b) => b.id === row.requestId);
    subject = bill?.payee ?? "a bill";
    // Margaret starts every bill. Family approval moves the money on; a timeout lets the hold go on its own.
    if (row.kind === "authorization") who = "Margaret";
    else if (row.kind === "void") who = bill?.decidedBy ?? SECOND_LOOK;
    else who = bill?.decidedBy ?? "Margaret";
  } else if (row.carePeriodId) {
    const period = input.periods.find((p) => p.id === row.carePeriodId);
    who = (period && closer(period, input.events)) ?? SECOND_LOOK;
    if (row.kind === "invoice") {
      const share = input.shares.find((s) => (row.shareId ? s.id === row.shareId : row.invoiceId !== null && s.invoiceId === row.invoiceId));
      subject = share?.member ?? "family";
    } else {
      subject = input.aide;
    }
  }
  return {
    id: row.id,
    at: row.createdAt.toISOString(),
    when: stamp(row.createdAt),
    who,
    fabric: fabricOf(who),
    what: STEP_WHAT[row.kind](subject),
    call: STEP_CALL[row.kind],
    amountCents: row.amountCents,
    amount: formatUsd(row.amountCents),
    paypalId: paypalIdOf(row) ?? "—",
    status: row.status,
    requestId: row.paypalRequestId,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Putting it together

const BLOCK_ORDER: Record<LedgerBlock["kind"], number> = { bill: 0, care: 1, share: 2 };

export function buildLedger(input: LedgerInput, now = new Date()): Ledger {
  const blocks: LedgerBlock[] = [];

  for (const bill of input.bills) {
    const rows = input.payments.filter((p) => p.requestId === bill.id).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    const block = billBlock(bill, rows, input.events);
    if (block) blocks.push(block);
  }

  for (const period of input.periods) {
    const rows = input.payments.filter((p) => p.carePeriodId === period.id);
    const care = careBlock(period, rows, input.events, input.aide);
    if (care) blocks.push(care);
    const shares = input.shares.filter((s) => s.carePeriodId === period.id).sort((a, b) => a.member.localeCompare(b.member));
    for (const share of shares) {
      const invoiceRows = rows.filter((r) => r.kind === "invoice" && (r.shareId ? r.shareId === share.id : r.invoiceId !== null && r.invoiceId === share.invoiceId));
      const block = shareBlock(share, period, invoiceRows, input.events, input.aide);
      if (block) blocks.push(block);
    }
  }

  blocks.sort((a, b) => a.at.localeCompare(b.at) || BLOCK_ORDER[a.kind] - BLOCK_ORDER[b.kind] || a.title.localeCompare(b.title));

  const thisMonday = weekOf(now);
  const byWeek = new Map<string, LedgerBlock[]>([[thisMonday, []]]);
  for (const block of blocks) {
    const monday = weekOf(new Date(block.at));
    byWeek.set(monday, [...(byWeek.get(monday) ?? []), block]);
  }

  // Who closed the care week, sewn onto the row it happened in.
  const closes = new Map<string, LedgerWeek["closedBy"]>();
  for (const period of [...input.periods].sort((a, b) => (a.closedAt?.getTime() ?? 0) - (b.closedAt?.getTime() ?? 0))) {
    const at = closedAt(period, input.events, input.payments.filter((p) => p.carePeriodId === period.id));
    const by = closer(period, input.events);
    if (at && by) closes.set(weekOf(at), { who: by, fabric: fabricOf(by), when: blockWhen(at) });
  }

  const weeks: LedgerWeek[] = [...byWeek.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monday, weekBlocks]) => ({
      id: monday,
      heading: weekHeading(monday, thisMonday),
      current: monday === thisMonday,
      closedBy: closes.get(monday) ?? null,
      blocks: weekBlocks,
    }));

  const steps = [...input.payments]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || KIND_ORDER[b.kind] - KIND_ORDER[a.kind])
    .map((row) => stepRow(row, input));

  // Open on what most needs reading: a payment waiting on family, else this week's cancelled hold, else the latest.
  const waiting = blocks.filter((b) => b.tone === "waiting" && b.kind === "bill").at(-1);
  const cancelled = (byWeek.get(thisMonday) ?? []).filter((b) => b.tone === "cancelled").at(-1);
  return { weeks, steps, selected: (waiting ?? cancelled ?? blocks.at(-1))?.id ?? null };
}
