// What Rosa's screen reads: her visits this past week (the last seven days to today, in Margaret's time zone, the
// same window the family's care week draws from) and whether the family has closed and paid any of it. Every query
// filters by the family, which belongs to one demo session (hard rule 10).

import type { AideVisit, CarePeriod } from "@/lib/copy/aide";
import { db } from "@/lib/db";
import type { Family, Member } from "@/lib/family";
import { assertCents } from "@/lib/money";
import { addDays, localDate } from "@/lib/time";

export interface AideWeek {
  aide: Member;
  parent: string;
  today: AideVisit | null;
  /** The past week's visits before today, oldest first. */
  earlier: AideVisit[];
  /** Every visit in the past seven days, today included. */
  visits: AideVisit[];
  periods: CarePeriod[];
}

export function familyAide(family: Family): Member {
  const aide = family.members.find((m) => m.role === "aide");
  if (!aide) throw new Error("this family has no aide");
  return aide;
}

export async function getAideWeek(family: Family, now = new Date()): Promise<AideWeek> {
  const sql = db();
  const aide = familyAide(family);
  const today = localDate(now);
  const firstDay = addDays(today, -6); // the window's first day: six days ago, so a Monday still shows her recent visits

  const [visitRows, periodRows] = await Promise.all([
    sql<
      {
        id: string;
        date: string;
        confirmed_by: "aide" | "parent";
        rate_cents: string;
        checked_in_at: Date | null;
        checked_out_at: Date | null;
        created_at: Date;
        care_period_id: string | null;
      }[]
    >`
      select id, visit_date::text as date, confirmed_by, rate_cents, checked_in_at, checked_out_at, created_at, care_period_id
      from visits
      where family_id = ${family.id} and aide_member_id = ${aide.id}
        and visit_date between ${firstDay}::date and ${today}::date
      order by visit_date`,
    sql<
      {
        id: string;
        start_date: string;
        end_date: string;
        status: CarePeriod["status"];
        payout_cents: string | null;
        paid_at: Date | null;
      }[]
    >`
      select cp.id, cp.start_date::text as start_date, cp.end_date::text as end_date, cp.status,
             payout.cents as payout_cents, payout.at as paid_at
      from care_periods cp
      left join lateral (
        select sum(p.amount_cents) as cents, max(p.created_at) as at
        from payments p
        where p.care_period_id = cp.id and p.family_id = ${family.id} and p.kind = 'payout'
          and lower(p.status) not in ('failed', 'denied', 'returned', 'blocked', 'reversed', 'refunded')
      ) payout on true
      where cp.family_id = ${family.id} and cp.start_date <= ${today}::date and cp.end_date >= ${firstDay}::date
      order by cp.end_date`,
  ]);

  const visits = visitRows.map((v): AideVisit => {
    const rateCents = Number(v.rate_cents);
    assertCents(rateCents, "visit rate");
    return {
      id: v.id,
      date: v.date,
      confirmedBy: v.confirmed_by,
      rateCents,
      checkedInAt: v.checked_in_at,
      checkedOutAt: v.checked_out_at,
      createdAt: v.created_at,
      carePeriodId: v.care_period_id,
    };
  });

  const periods = periodRows.map((p): CarePeriod => {
    const payoutCents = p.payout_cents === null ? null : Number(p.payout_cents);
    if (payoutCents !== null) assertCents(payoutCents, "payout");
    return { id: p.id, startDate: p.start_date, endDate: p.end_date, status: p.status, payoutCents, paidAt: p.paid_at };
  });

  return {
    aide,
    parent: family.members.find((m) => m.role === "parent")?.name ?? "Margaret",
    today: visits.find((v) => v.date === today) ?? null,
    earlier: visits.filter((v) => v.date < today),
    visits,
    periods,
  };
}
