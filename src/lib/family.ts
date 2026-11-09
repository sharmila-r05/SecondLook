// The visitor's demo family and what each screen reads from it. Every query filters by the family, which belongs to
// exactly one demo session (hard rule 10).

import type postgres from "postgres";
import type { SecondLook } from "@/lib/copy/family";
import type { BillState, ParentEntry } from "@/lib/copy/parent";
import { db } from "@/lib/db";
import { seedFamily } from "@/lib/demo/seed";
import { assertCents } from "@/lib/money";
import type { RuleHit } from "@/lib/risk";
import type { PaymentRequestState } from "@/lib/states";
import { localDate, PARENT_TIME_ZONE } from "@/lib/time";

export interface Member {
  id: string;
  name: string;
  role: "parent" | "child" | "aide";
}

export interface Family {
  id: string;
  members: Member[];
}

/** One writer per session at a time: seeding and Reset can't interleave for the same visitor. */
async function lockSession(tx: postgres.TransactionSql, sessionId: string) {
  await tx`select pg_advisory_xact_lock(hashtext(${sessionId}))`;
}

/** The session's family, seeded on its first visit. */
export async function ensureFamily(sessionId: string): Promise<Family> {
  return db().begin(async (tx) => {
    await lockSession(tx, sessionId);
    const [row] = await tx<{ id: string }[]>`select id from families where demo_session_id = ${sessionId} limit 1`;
    const familyId = row?.id ?? (await seedFamily(tx, sessionId));
    const members = await tx<Member[]>`select id, name, role from members where family_id = ${familyId} order by role, name`;
    return { id: familyId, members: [...members] };
  });
}

/** Reset (brief §4): this session's rows only, then a fresh family. Other visitors are untouched. */
export async function resetFamily(sessionId: string): Promise<void> {
  await db().begin(async (tx) => {
    await lockSession(tx, sessionId);
    await tx`delete from families where demo_session_id = ${sessionId}`;
    await seedFamily(tx, sessionId);
  });
}

export function memberNamed(family: Family, role: Member["role"]): string | undefined {
  return family.members.find((m) => m.role === role)?.name;
}

function billState(status: PaymentRequestState, decidedBy: string | null): BillState {
  switch (status) {
    case "new":
    case "approved_auto":
      return "processing";
    case "held":
      return "waiting";
    case "approved_by_family":
      return "approved";
    case "paid":
      return decidedBy ? "approved" : "paid";
    case "denied":
      return "declined";
    case "expired":
      return "expired";
    case "voided":
      return decidedBy ? "declined" : "expired";
  }
}

/** Today's payments and visits, in Margaret's time zone. */
export async function getParentDay(family: Family, now = new Date()): Promise<ParentEntry[]> {
  const sql = db();
  const day = localDate(now);
  const checker = memberNamed(family, "child") ?? "family";

  const bills = await sql<
    { id: string; status: PaymentRequestState; amount_cents: string; created_at: Date; payee: string | null; decided_by: string | null }[]
  >`
    select pr.id, pr.status, pr.amount_cents, pr.created_at, p.name as payee, m.name as decided_by
    from payment_requests pr
    left join payees p on p.id = pr.payee_id
    left join members m on m.id = pr.decided_by_member_id
    where pr.family_id = ${family.id}
      and (pr.created_at at time zone ${PARENT_TIME_ZONE})::date = ${day}::date`;

  const visits = await sql<{ id: string; aide: string; at: Date }[]>`
    select v.id, m.name as aide, coalesce(v.checked_in_at, v.created_at) as at
    from visits v
    join members m on m.id = v.aide_member_id
    where v.family_id = ${family.id} and v.visit_date = ${day}::date`;

  return [
    ...bills.map((b): ParentEntry => {
      const amountCents = Number(b.amount_cents);
      assertCents(amountCents);
      return {
        kind: "bill",
        id: b.id,
        state: billState(b.status, b.decided_by),
        payee: b.payee ?? "someone new",
        amountCents,
        at: b.created_at,
        familyMember: b.decided_by ?? checker,
      };
    }),
    ...visits.map((v): ParentEntry => ({ kind: "visit", id: v.id, aide: v.aide, at: v.at })),
  ];
}

/** Payments that went to family for a second look this week: what's waiting first, then the latest decisions. */
export async function getSecondLooks(family: Family): Promise<SecondLook[]> {
  const rows = await db()<
    {
      id: string;
      status: PaymentRequestState;
      amount_cents: string;
      created_at: Date;
      updated_at: Date;
      risk_note: string | null;
      triggered_rules: RuleHit[];
      hold_expires_at: Date | null;
      payee: string;
      decided_by: string | null;
    }[]
  >`
    select pr.id, pr.status, pr.amount_cents, pr.created_at, pr.updated_at, pr.risk_note, pr.triggered_rules,
           pr.hold_expires_at, p.name as payee, m.name as decided_by
    from payment_requests pr
    join payees p on p.id = pr.payee_id
    left join members m on m.id = pr.decided_by_member_id
    where pr.family_id = ${family.id} and pr.status <> 'new' and jsonb_array_length(pr.triggered_rules) > 0
      and pr.created_at > now() - interval '7 days'
    order by (pr.status = 'held') desc, pr.updated_at desc
    limit 20`;
  return rows.map((r) => {
    const amountCents = Number(r.amount_cents);
    assertCents(amountCents);
    return {
      id: r.id,
      status: r.status,
      payee: r.payee,
      amountCents,
      at: r.created_at,
      note: r.risk_note,
      rules: r.triggered_rules,
      holdExpiresAt: r.hold_expires_at,
      decidedBy: r.decided_by,
      decidedAt: r.updated_at,
    };
  });
}

/** Rosa's visits since the week was last closed (up to today, in Margaret's time zone) and what they come to. */
export async function getCareWeek(family: Family, now = new Date()): Promise<{ visits: number; totalCents: number; aide: string }> {
  const [row] = await db()<{ visits: string; total: string | null }[]>`
    select count(*) as visits, sum(rate_cents) as total from visits
    where family_id = ${family.id}
      and visit_date <= (${now}::timestamptz at time zone ${PARENT_TIME_ZONE})::date
      and visit_date > coalesce((select max(end_date) from care_periods where family_id = ${family.id}), '-infinity'::date)`;
  return { visits: Number(row?.visits ?? 0), totalCents: Number(row?.total ?? 0), aide: memberNamed(family, "aide") ?? "The aide" };
}
