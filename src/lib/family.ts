// The visitor's demo family and what each screen reads from it. Every query filters by the family, which belongs to
// exactly one demo session (hard rule 10).

import type postgres from "postgres";
import type { SecondLook } from "@/lib/copy/family";
import type { BillState, ParentEntry } from "@/lib/copy/parent";
import { db } from "@/lib/db";
import { type SeedOptions, seedFamily } from "@/lib/demo/seed";
import { assertCents } from "@/lib/money";
import type { RuleHit } from "@/lib/risk";
import type { FamilySettings, SetupStep } from "@/lib/settings";
import type { PaymentRequestState } from "@/lib/states";
import { localDate, PARENT_TIME_ZONE } from "@/lib/time";

export interface Member {
  id: string;
  name: string;
  role: "parent" | "child" | "aide";
  /** When a device first opened this person's screen from an invite. */
  joinedAt: Date | null;
}

export interface Family {
  id: string;
  members: Member[];
  settings: FamilySettings;
}

/** One writer per session at a time: seeding and Reset can't interleave for the same visitor. */
async function lockSession(tx: postgres.TransactionSql, sessionId: string) {
  await tx`select pg_advisory_xact_lock(hashtext(${sessionId}))`;
}

interface SettingsRow {
  origin: FamilySettings["origin"];
  organizer_member_id: string | null;
  limit_cents: string;
  daily_limit_cents: string;
  unusual_multiple: number;
  hold_minutes: number;
  ask: FamilySettings["ask"];
  visit_rate_cents: string;
  split_rule: Record<string, number>;
  setup_step: SetupStep | null;
  setup_completed_at: Date | null;
  parent_agreed_at: Date | null;
}

function settingsFrom(row: SettingsRow): FamilySettings {
  const cents = (v: string) => {
    const n = Number(v);
    assertCents(n);
    return n;
  };
  return {
    origin: row.origin,
    organizerId: row.organizer_member_id,
    limitCents: cents(row.limit_cents),
    dailyLimitCents: cents(row.daily_limit_cents),
    unusualMultiple: row.unusual_multiple,
    holdMinutes: row.hold_minutes,
    ask: row.ask,
    visitRateCents: cents(row.visit_rate_cents),
    split: row.split_rule,
    setupStep: row.setup_step,
    setupCompletedAt: row.setup_completed_at,
    parentAgreedAt: row.parent_agreed_at,
  };
}

/** One family, by id: its people and its rules. */
export async function loadFamily(sql: postgres.Sql | postgres.TransactionSql, familyId: string): Promise<Family> {
  const [row] = await sql<SettingsRow[]>`
    select origin, organizer_member_id, limit_cents, daily_limit_cents, unusual_multiple, hold_minutes, ask,
           visit_rate_cents, split_rule, setup_step, setup_completed_at, parent_agreed_at
    from families where id = ${familyId}`;
  if (!row) throw new Error("family not found");
  const members = await sql<Member[]>`
    select id, name, role, joined_at as "joinedAt" from members where family_id = ${familyId} order by role, name`;
  return { id: familyId, members: [...members], settings: settingsFrom(row) };
}

/** The session's family, seeded as the ready-made one on its first visit. */
export async function ensureFamily(sessionId: string): Promise<Family> {
  return db().begin(async (tx) => {
    await lockSession(tx, sessionId);
    const [row] = await tx<{ id: string }[]>`select id from families where demo_session_id = ${sessionId} limit 1`;
    const familyId = row?.id ?? (await seedFamily(tx, sessionId));
    return loadFamily(tx, familyId);
  });
}

/** The session's family, if it has one yet; never seeds. */
export async function findFamily(sessionId: string): Promise<Family | null> {
  const [row] = await db()<{ id: string }[]>`select id from families where demo_session_id = ${sessionId} limit 1`;
  return row ? loadFamily(db(), row.id) : null;
}

/**
 * Reset (brief §4): this session's rows only, then a fresh family of the same kind. A family someone set up starts
 * its setup over, with the same person setting it up; the ready-made one is seeded again. Other visitors are untouched.
 */
export async function resetFamily(sessionId: string): Promise<void> {
  await db().begin(async (tx) => {
    await lockSession(tx, sessionId);
    const [old] = await tx<{ origin: FamilySettings["origin"]; organizer: string | null }[]>`
      select f.origin, m.name as organizer from families f left join members m on m.id = f.organizer_member_id
      where f.demo_session_id = ${sessionId} limit 1`;
    await tx`delete from families where demo_session_id = ${sessionId}`;
    const options: SeedOptions =
      old?.origin === "setup" ? { origin: "setup", organizer: old.organizer === "Tom" ? "Tom" : "Sarah" } : { origin: "ready" };
    await seedFamily(tx, sessionId, options);
  });
}

/**
 * A new family that its organizer sets up step by step, replacing whatever this session had. The account signed in
 * on this device, if any, becomes the organizer.
 */
export async function startSetupFamily(sessionId: string, organizer: "Sarah" | "Tom", accountId?: string): Promise<Family> {
  return db().begin(async (tx) => {
    await lockSession(tx, sessionId);
    await tx`delete from families where demo_session_id = ${sessionId}`;
    const familyId = await seedFamily(tx, sessionId, { origin: "setup", organizer });
    if (accountId) await tx`update accounts set member_name = ${organizer} where id = ${accountId} and demo_session_id = ${sessionId}`;
    return loadFamily(tx, familyId);
  });
}

export function memberNamed(family: Family, role: Member["role"]): string | undefined {
  return family.members.find((m) => m.role === role)?.name;
}

/** Who set the family up: the one Margaret's screen names ("Sent to Tom to double-check"). */
export function organizerOf(family: Family): Member | undefined {
  return family.members.find((m) => m.id === family.settings.organizerId) ?? family.members.find((m) => m.role === "child");
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
  const checker = organizerOf(family)?.name ?? "family";

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
