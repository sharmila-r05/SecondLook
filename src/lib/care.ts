// Closing the care week (flow C). Rosa's visits since the last close are totalled; Rosa is paid by PayPal Payouts from
// Second Look's balance, and Sarah and Tom each get a PayPal invoice for their share (largest-remainder split, the
// leftover cent to Sarah, hard rule 5). Every PayPal key is fixed and stored before its call (hard rule 4): the
// payout's sender_batch_id, each invoice number, each request ID. A step that fails is finished on the next look.

import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { payoutWithTopUp } from "@/lib/balance";
import { db } from "@/lib/db";
import { SANDBOX_EMAILS } from "@/lib/demo/accounts";
import { recordEvent } from "@/lib/events";
import type { Family } from "@/lib/family";
import { loadFamily, memberNamed } from "@/lib/family";
import { assertCents, splitCents } from "@/lib/money";
import { createInvoice, getInvoice, PayPalError, sendInvoice } from "@/lib/paypal";
import { localDate } from "@/lib/time";

type Sql = postgres.Sql | postgres.TransactionSql;

export interface OpenVisit {
  date: string;
  rateCents: number;
}

export interface ShareView {
  id: string;
  memberId: string;
  name: string;
  amountCents: number;
  status: "pending" | "sent" | "paid";
  payUrl: string | null;
}

export interface ClosedPeriod {
  id: string;
  startDate: string;
  endDate: string;
  visits: number;
  totalCents: number;
  status: "closing" | "closed";
  closedBy: string | null;
  closedAt: Date | null;
  payoutStatus: string | null;
  shares: ShareView[];
}

export interface CareView {
  aide: string;
  open: { visits: OpenVisit[]; totalCents: number; shares: { name: string; amountCents: number }[] };
  last: ClosedPeriod | null;
}

/** A sibling's share of the total, in the family's split, with the leftover cent to Sarah. */
export function shareOut(totalCents: number, split: Record<string, number>, members: Family["members"]): { memberId: string; name: string; amountCents: number }[] {
  const children = members.filter((m) => m.role === "child" && split[m.id] !== undefined);
  if (children.length === 0 || totalCents === 0) return children.map((m) => ({ memberId: m.id, name: m.name, amountCents: 0 }));
  const fixed = children.find((m) => m.name === "Sarah") ?? children[0];
  const cents = splitCents(totalCents, Object.fromEntries(children.map((m) => [m.id, split[m.id] ?? 0])), fixed!.id);
  return children.map((m) => ({ memberId: m.id, name: m.name, amountCents: cents[m.id] ?? 0 }));
}

/**
 * PayPal invoice numbers are unique across the whole merchant account, so they carry 64 bits of the period's id; PayPal
 * caps them at 25 characters (INVALID_STRING_MAX_LENGTH above that, measured 9 Nov).
 */
export function invoiceNumber(periodId: string, name: string): string {
  return `SL-${periodId.replace(/-/g, "").slice(0, 16).toUpperCase()}-${name.slice(0, 4).toUpperCase()}`;
}

async function splitRule(sql: Sql, familyId: string): Promise<Record<string, number>> {
  const [row] = await sql<{ split_rule: Record<string, number> }[]>`select split_rule from families where id = ${familyId}`;
  return row?.split_rule ?? {};
}

async function openVisits(sql: Sql, familyId: string, today: string): Promise<OpenVisit[]> {
  const rows = await sql<{ date: string; rate_cents: string }[]>`
    select v.visit_date::text as date, v.rate_cents from visits v
    where v.family_id = ${familyId} and v.visit_date <= ${today}::date
      and v.visit_date > coalesce((select max(end_date) from care_periods where family_id = ${familyId}), '-infinity'::date)
    order by v.visit_date`;
  return rows.map((r) => ({ date: r.date, rateCents: Number(r.rate_cents) }));
}

export async function getCare(family: Family, now = new Date()): Promise<CareView> {
  const sql = db();
  const visits = await openVisits(sql, family.id, localDate(now));
  const totalCents = visits.reduce((sum, v) => sum + v.rateCents, 0);
  assertCents(totalCents);
  const split = await splitRule(sql, family.id);
  const open = { visits, totalCents, shares: shareOut(totalCents, split, family.members).map(({ name, amountCents }) => ({ name, amountCents })) };

  const [period] = await sql<
    { id: string; start_date: string; end_date: string; visits: number | null; total_cents: string; status: "closing" | "closed"; closed_by: string | null; closed_at: Date | null; payout_status: string | null }[]
  >`
    select cp.id, cp.start_date::text, cp.end_date::text, cp.visits, cp.total_cents, cp.status, m.name as closed_by, cp.closed_at,
           (select status from payments where care_period_id = cp.id and kind = 'payout' limit 1) as payout_status
    from care_periods cp left join members m on m.id = cp.closed_by_member_id
    where cp.family_id = ${family.id} and cp.status in ('closing', 'closed')
    order by cp.end_date desc limit 1`;
  let last: ClosedPeriod | null = null;
  if (period) {
    const shares = await sql<{ id: string; member_id: string; name: string; amount_cents: string; status: ShareView["status"]; pay_url: string | null }[]>`
      select s.id, s.member_id, m.name, s.amount_cents, s.status, s.pay_url
      from shares s join members m on m.id = s.member_id
      where s.care_period_id = ${period.id} order by m.name`;
    last = {
      id: period.id,
      startDate: period.start_date,
      endDate: period.end_date,
      visits: period.visits ?? 0,
      totalCents: Number(period.total_cents),
      status: period.status,
      closedBy: period.closed_by,
      closedAt: period.closed_at,
      payoutStatus: period.payout_status,
      shares: shares.map((s) => ({ id: s.id, memberId: s.member_id, name: s.name, amountCents: Number(s.amount_cents), status: s.status, payUrl: s.pay_url })),
    };
  }
  return { aide: memberNamed(family, "aide") ?? "The aide", open, last };
}

/**
 * Closes the visits since the last close: one care period, its shares and its payment rows, all with their PayPal
 * keys, in one transaction; then the PayPal calls. Returns the period id, or null when there's nothing to close.
 */
export async function closeWeek(family: Family, sessionId: string, closedByMemberId: string, now = new Date()): Promise<string | null> {
  const today = localDate(now);
  const periodId = await db().begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${`care:${family.id}`}))`;
    const visits = await openVisits(tx, family.id, today);
    if (visits.length === 0) return null;
    const totalCents = visits.reduce((sum, v) => sum + v.rateCents, 0);
    assertCents(totalCents);
    const id = randomUUID();
    await tx`
      insert into care_periods (id, demo_session_id, family_id, start_date, end_date, total_cents, status, payout_sender_batch_id,
                                visits, closed_by_member_id, closed_at)
      values (${id}, ${sessionId}, ${family.id}, ${visits[0]!.date}, ${today}, ${totalCents}, 'closing', ${`sl-care-${id}`},
              ${visits.length}, ${closedByMemberId}, now())`;
    await tx`
      insert into payments (demo_session_id, family_id, care_period_id, kind, paypal_request_id, amount_cents, status)
      values (${sessionId}, ${family.id}, ${id}, 'payout', ${randomUUID()}, ${totalCents}, 'paying')`;
    for (const share of shareOut(totalCents, await splitRule(tx, family.id), family.members)) {
      const shareId = randomUUID();
      const requestId = randomUUID();
      await tx`
        insert into shares (id, demo_session_id, care_period_id, member_id, amount_cents, invoice_number, paypal_request_id, status)
        values (${shareId}, ${sessionId}, ${id}, ${share.memberId}, ${share.amountCents}, ${invoiceNumber(id, share.name)}, ${requestId}, 'pending')`;
      await tx`
        insert into payments (demo_session_id, family_id, care_period_id, share_id, kind, paypal_request_id, amount_cents, status)
        values (${sessionId}, ${family.id}, ${id}, ${shareId}, 'invoice', ${requestId}, ${share.amountCents}, 'creating')`;
    }
    const by = family.members.find((m) => m.id === closedByMemberId)?.name ?? null;
    await recordEvent(tx, family, sessionId, "week:closed", { carePeriodId: id, startDate: visits[0]!.date, endDate: today, visits: visits.length, totalCents, by });
    return id;
  });
  if (periodId && !(await startClosingRun(family, sessionId, periodId))) await finishClosing(family, sessionId, periodId);
  return periodId;
}

const workflowConfigured = () => Boolean(process.env.RENDER_WORKFLOW && process.env.RENDER_WORKFLOW_API_KEY);

/**
 * Hands the PayPal steps of a close to Render Workflows, which retries them with backoff. Each step is idempotent
 * (fixed sender_batch_id, invoice numbers, send-only-drafts), so a retry never pays twice. Returns false when the
 * workflow isn't configured or Render refused the run, and the caller does the work inline instead.
 */
async function startClosingRun(family: Pick<Family, "id">, sessionId: string, periodId: string): Promise<boolean> {
  if (!workflowConfigured()) return false;
  try {
    const res = await fetch("https://api.render.com/v1/task-runs", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RENDER_WORKFLOW_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ task: `${process.env.RENDER_WORKFLOW}/finishCloseWeek`, input: [periodId], idempotencyKey: `close-${periodId}` }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`Render Workflows refused the close run: HTTP ${res.status}`);
      return false;
    }
    const run = (await res.json().catch(() => ({}))) as { id?: string };
    await recordEvent(db(), family, sessionId, "workflow:started", { carePeriodId: periodId, taskRunId: run.id ?? null });
    return true;
  } catch (err) {
    console.error("starting the Render Workflows run failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** The workflow task's entry point: loads the period's family and session, then finishes the close. */
export async function finishClosingById(periodId: string): Promise<{ status: string }> {
  const sql = db();
  const [period] = await sql<{ family_id: string; demo_session_id: string }[]>`
    select family_id, demo_session_id from care_periods where id = ${periodId}`;
  if (!period) return { status: "unknown period" };
  await finishClosing(await loadFamily(sql, period.family_id), period.demo_session_id, periodId);
  const [after] = await sql<{ status: string }[]>`select status from care_periods where id = ${periodId}`;
  return { status: after?.status ?? "unknown" };
}

const SHORT_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Nov 5", "Nov 5–9", or "Oct 30–Nov 2", from two local dates. */
export function periodSpan(start: string, end: string): string {
  const from = SHORT_DAY.format(new Date(`${start}T12:00:00Z`));
  if (start === end) return from;
  return `${from}–${start.slice(0, 7) === end.slice(0, 7) ? Number(end.slice(8, 10)) : SHORT_DAY.format(new Date(`${end}T12:00:00Z`))}`;
}

/** Pays Rosa and sends both invoices for a closing period. Safe to run again: each step checks what's already done. */
export async function finishClosing(family: Family, sessionId: string, periodId: string): Promise<void> {
  const sql = db();
  const [period] = await sql<{ status: string; start_date: string; end_date: string; total_cents: string; visits: number; payout_sender_batch_id: string }[]>`
    select status, start_date::text, end_date::text, total_cents, visits, payout_sender_batch_id
    from care_periods where id = ${periodId} and family_id = ${family.id}`;
  if (!period || period.status === "closed") return;
  const totalCents = Number(period.total_cents);
  const aide = memberNamed(family, "aide") ?? "Rosa";
  const when = periodSpan(period.start_date, period.end_date);

  const [payout] = await sql<{ id: string; paypal_request_id: string; paypal_payout_batch_id: string | null }[]>`
    select id, paypal_request_id, paypal_payout_batch_id from payments where care_period_id = ${periodId} and kind = 'payout'`;
  if (payout && !payout.paypal_payout_batch_id) {
    const sent = await payoutWithTopUp(payout.id, {
      senderBatchId: period.payout_sender_batch_id,
      requestId: payout.paypal_request_id,
      receiverEmail: SANDBOX_EMAILS.rosa,
      amountCents: totalCents,
      note: `Pay for ${period.visits} ${period.visits === 1 ? "visit" : "visits"} with Margaret, ${when}`,
      senderItemId: periodId,
      emailSubject: "Your pay from Margaret's family",
    });
    await sql`update payments set paypal_payout_batch_id = ${sent.payoutBatchId}, status = ${sent.batchStatus} where id = ${payout.id}`;
    await recordEvent(sql, family, sessionId, "paypal:payout", { carePeriodId: periodId, payoutBatchId: sent.payoutBatchId, payee: aide, amountCents: totalCents });
  }

  const shares = await sql<{ id: string; member_id: string; name: string; amount_cents: string; invoice_number: string; paypal_request_id: string; paypal_invoice_id: string | null; status: string }[]>`
    select s.id, s.member_id, m.name, s.amount_cents, s.invoice_number, s.paypal_request_id, s.paypal_invoice_id, s.status
    from shares s join members m on m.id = s.member_id where s.care_period_id = ${periodId}`;
  for (const share of shares) {
    if (share.status !== "pending") continue;
    const amountCents = Number(share.amount_cents);
    const email = SANDBOX_EMAILS[share.name.toLowerCase() as "sarah" | "tom"];
    if (!email) continue;
    let invoiceId = share.paypal_invoice_id;
    if (!invoiceId) {
      const created = await createInvoice({
        invoiceNumber: share.invoice_number,
        requestId: share.paypal_request_id,
        recipientName: share.name,
        recipientEmail: email,
        invoicerEmail: SANDBOX_EMAILS.secondLook,
        amountCents,
        itemName: `Care for Margaret, ${when}`,
        note: `Your share of ${aide}'s pay for ${period.visits} ${period.visits === 1 ? "visit" : "visits"} with Mom, ${when}. ${aide} has already been paid.`,
      });
      invoiceId = created.invoiceId;
      await sql`update shares set paypal_invoice_id = ${invoiceId}, pay_url = ${created.payUrl} where id = ${share.id}`;
      await sql`update payments set paypal_invoice_id = ${invoiceId}, status = ${created.status} where share_id = ${share.id}`;
    }
    const sent = await sendInvoice({ invoiceId, requestId: `${share.paypal_request_id.slice(0, 30)}-send` });
    await sql`update shares set status = 'sent', pay_url = coalesce(${sent.payUrl}, pay_url), checked_at = now() where id = ${share.id}`;
    await sql`update payments set status = ${sent.status} where share_id = ${share.id}`;
    await recordEvent(sql, family, sessionId, "paypal:invoice_sent", {
      carePeriodId: periodId,
      shareId: share.id,
      to: share.name,
      amountCents,
      invoiceId,
      invoiceNumber: share.invoice_number,
    });
  }

  await sql`
    update care_periods set status = 'closed'
    where id = ${periodId} and status = 'closing'
      and exists (select 1 from payments where care_period_id = ${periodId} and kind = 'payout' and paypal_payout_batch_id is not null)
      and not exists (select 1 from shares where care_period_id = ${periodId} and status = 'pending')`;
}

const PAID = new Set(["PAID", "MARKED_AS_PAID"]);

/**
 * Records PayPal's latest status for an invoice; when it's paid, the share is paid and the ledger gets one
 * `paypal:invoice_paid` event (the conditional update makes a poll and a webhook arriving together count once).
 * Returns true when this call moved the share to paid.
 */
export async function markInvoicePaid(invoiceId: string, status: string): Promise<boolean> {
  const sql = db();
  await sql`update payments set status = ${status} where kind = 'invoice' and paypal_invoice_id = ${invoiceId}`;
  if (!PAID.has(status)) return false;
  const [share] = await sql<{ id: string; care_period_id: string; amount_cents: string; name: string; family_id: string; demo_session_id: string }[]>`
    update shares s set status = 'paid', checked_at = now()
    from members m, care_periods cp
    where s.paypal_invoice_id = ${invoiceId} and s.status = 'sent' and m.id = s.member_id and cp.id = s.care_period_id
    returning s.id, s.care_period_id, s.amount_cents, m.name, cp.family_id, cp.demo_session_id`;
  if (!share) return false;
  await recordEvent(sql, { id: share.family_id }, share.demo_session_id, "paypal:invoice_paid", {
    carePeriodId: share.care_period_id,
    shareId: share.id,
    to: share.name,
    amountCents: Number(share.amount_cents),
    invoiceId,
  });
  return true;
}

/**
 * On each look: finishes any close that stopped halfway, and asks PayPal (at most every 10 seconds per invoice) whether
 * a sent invoice has been paid. Never throws: the screen shows what's known.
 */
export async function refreshCare(family: Family, sessionId: string): Promise<void> {
  const sql = db();
  try {
    const stuck = await sql<{ id: string }[]>`
      select id from care_periods where family_id = ${family.id} and status = 'closing'
        and closed_at < now() - ${workflowConfigured() ? "90 seconds" : "15 seconds"}::interval`;
    for (const { id } of stuck) await finishClosing(family, sessionId, id);

    const due = await sql<{ id: string; care_period_id: string; name: string; amount_cents: string; paypal_invoice_id: string }[]>`
      select s.id, s.care_period_id, m.name, s.amount_cents, s.paypal_invoice_id
      from shares s join members m on m.id = s.member_id join care_periods cp on cp.id = s.care_period_id
      where cp.family_id = ${family.id} and s.status = 'sent' and s.paypal_invoice_id is not null
        and (s.checked_at is null or s.checked_at < now() - interval '10 seconds')`;
    for (const share of due) {
      const latest = await getInvoice(share.paypal_invoice_id);
      if (!(await markInvoicePaid(share.paypal_invoice_id, latest.status))) await sql`update shares set checked_at = now() where id = ${share.id}`;
    }
  } catch (err) {
    console.error("refreshing the care week failed:", err instanceof PayPalError ? `${err.issue} (debug_id ${err.debugId})` : err);
  }
}
