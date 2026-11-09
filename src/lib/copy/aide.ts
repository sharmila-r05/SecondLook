// Everything Rosa's screen says about her visits and her pay. Plain words, her times in Margaret's time zone, and
// money only in whole cents (hard rule 5).

import { formatUsd } from "@/lib/money";
import { formatTime, localDate } from "@/lib/time";

export interface AideVisit {
  id: string;
  /** "2026-11-09", the visit's day in Margaret's time zone. */
  date: string;
  confirmedBy: "aide" | "parent";
  rateCents: number;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  /** When the visit was first noted: Rosa's check-in or Margaret's "Rosa came today". */
  createdAt: Date;
}

export interface CarePeriod {
  startDate: string;
  endDate: string;
  status: "open" | "closing" | "closed";
  /** What the payout to the aide came to, if one was made. */
  payoutCents: number | null;
  /** When the payout was sent. */
  paidAt: Date | null;
}

/** "8:30–10:30 am", or "11:30 am–12:45 pm" across noon; just "1:27 am" when both ends fall in the same minute. */
export function formatTimeRange(start: Date, end: Date): string {
  const from = formatTime(start);
  const to = formatTime(end);
  if (from === to) return from;
  const suffix = / [ap]m$/;
  const fromSuffix = suffix.exec(from)?.[0];
  return fromSuffix && fromSuffix === suffix.exec(to)?.[0] ? `${from.replace(suffix, "")}–${to}` : `${from}–${to}`;
}

/** "Monday" for "2026-11-09". A calendar date has no time zone, so it is read as noon UTC. */
export function weekdayName(ymd: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${ymd}T12:00:00Z`));
}

/** "Thursday, Nov 5" for "2026-11-05": the list runs back seven days, so a weekday alone could mean last week's. */
export function dayLabel(ymd: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${ymd}T12:00:00Z`),
  );
}

/** When the visit started: Rosa's check-in, or when Margaret said she came. */
function startedAt(visit: AideVisit): Date {
  return visit.checkedInAt ?? visit.createdAt;
}

function covers(period: CarePeriod, date: string): boolean {
  return period.startDate <= date && date <= period.endDate;
}

/** A closed week covers this visit, so its pay has gone out to Rosa by PayPal. */
export function isPaid(visit: AideVisit, periods: readonly CarePeriod[]): boolean {
  return periods.some((p) => p.status === "closed" && covers(p, visit.date));
}

export interface VisitRow {
  id: string;
  day: string;
  times: string;
  pay: string;
  /** The family closed a week covering this visit: its pay has gone out. */
  paid: boolean;
}

/** One settled row in the week: the day, the hours, the pay, and whether it's been paid. */
export function visitRow(visit: AideVisit, periods: readonly CarePeriod[] = [], label = dayLabel(visit.date)): VisitRow {
  const start = startedAt(visit);
  return {
    id: visit.id,
    day: label,
    times: visit.checkedOutAt ? formatTimeRange(start, visit.checkedOutAt) : formatTime(start),
    pay: formatUsd(visit.rateCents),
    paid: isPaid(visit, periods),
  };
}

export type TodayCard =
  | { step: "start" }
  | { step: "visiting"; title: string; detail: string }
  | { step: "done"; row: VisitRow };

/**
 * Today's visit, one step at a time: not here yet, here (checked in, or noted by Margaret), done. One visit a day, so
 * Margaret's "Rosa came today" and Rosa's own check-in are the same visit.
 */
export function todayCard(visit: AideVisit | null, parent: string, periods: readonly CarePeriod[] = []): TodayCard {
  if (!visit) return { step: "start" };
  if (visit.checkedOutAt) return { step: "done", row: visitRow(visit, periods, "Today") };
  const pay = formatUsd(visit.rateCents);
  if (visit.checkedInAt) return { step: "visiting", title: `Checked in ${formatTime(visit.checkedInAt)}`, detail: `Today’s visit · ${pay}` };
  return { step: "visiting", title: `${parent} said you came today`, detail: `At ${formatTime(visit.createdAt)} · ${pay}` };
}

export interface WeekSummary {
  count: string;
  totalCents: number;
  total: string;
  /** How and when Rosa is paid for the week; `settled` once that money has gone out. */
  pay: { text: string; settled: boolean }[];
}

/**
 * The week's total and how it is paid. Pay goes out by PayPal Payouts when the family closes the week; once a
 * closed period covers some of these visits, Rosa sees when it was paid, and anything after it still waits.
 */
export function weekSummary(visits: readonly AideVisit[], periods: readonly CarePeriod[], now = new Date()): WeekSummary {
  const totalCents = visits.reduce((sum, v) => sum + v.rateCents, 0);
  const settled = periods.filter((p) => p.status !== "open");
  const waitingCents = visits.filter((v) => !settled.some((p) => covers(p, v.date))).reduce((sum, v) => sum + v.rateCents, 0);
  const pay: WeekSummary["pay"] = [];

  for (const period of settled) {
    const cents = period.payoutCents ?? visits.filter((v) => covers(period, v.date)).reduce((sum, v) => sum + v.rateCents, 0);
    if (cents === 0) continue;
    if (period.status === "closing") {
      pay.push({ text: `${formatUsd(cents)} is on its way to you by PayPal.`, settled: false });
    } else if (period.paidAt) {
      const on = localDate(period.paidAt) === localDate(now) ? "today" : `on ${weekdayName(localDate(period.paidAt))}`;
      pay.push({ text: `Paid ${formatUsd(cents)} by PayPal ${on}.`, settled: true });
    } else {
      pay.push({ text: `Paid ${formatUsd(cents)} by PayPal.`, settled: true });
    }
  }

  if (pay.length === 0) {
    pay.push({ text: "Pay arrives by PayPal when the family closes the week.", settled: false });
  } else if (waitingCents > 0) {
    pay.push({ text: `${formatUsd(waitingCents)} more arrives by PayPal when the family next closes the week.`, settled: false });
  }

  const n = visits.length;
  return { count: n === 0 ? "no visits yet" : `${n} ${n === 1 ? "visit" : "visits"}`, totalCents, total: formatUsd(totalCents), pay };
}
