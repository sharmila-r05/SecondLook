import { describe, expect, it } from "vitest";
import { type AideVisit, type CarePeriod, formatTimeRange, todayCard, visitRow, weekdayName, weekSummary } from "@/lib/copy/aide";

// November is Eastern Standard Time in Ohio: 13:30 UTC is 8:30 am.
const visit = (date: string, over: Partial<AideVisit> = {}): AideVisit => ({
  id: date,
  date,
  confirmedBy: "aide",
  rateCents: 5000,
  checkedInAt: new Date(`${date}T13:30:00Z`),
  checkedOutAt: new Date(`${date}T15:30:00Z`),
  createdAt: new Date(`${date}T13:30:00Z`),
  ...over,
});
const friday = new Date("2026-11-13T15:00:00Z");
const week = [visit("2026-11-09"), visit("2026-11-11"), visit("2026-11-13", { checkedOutAt: null })];

describe("formatTimeRange", () => {
  it("says am or pm once when both ends share it", () => {
    expect(formatTimeRange(new Date("2026-11-09T13:30:00Z"), new Date("2026-11-09T16:45:00Z"))).toBe("8:30–11:45 am");
  });

  it("says both across noon", () => {
    expect(formatTimeRange(new Date("2026-11-09T16:30:00Z"), new Date("2026-11-09T17:45:00Z"))).toBe("11:30 am–12:45 pm");
  });
});

describe("weekdayName", () => {
  it("reads a calendar date as that day, whatever the server's time zone", () => {
    expect(weekdayName("2026-11-09")).toBe("Monday");
    expect(weekdayName("2026-11-15")).toBe("Sunday");
  });
});

describe("visitRow", () => {
  it("gives the day, the hours and the pay", () => {
    expect(visitRow(visit("2026-11-11"))).toEqual({ id: "2026-11-11", day: "Wednesday", times: "8:30–10:30 am", pay: "$50.00" });
  });

  it("uses when Margaret said Rosa came, for a visit Rosa didn't check in to", () => {
    const noted = visit("2026-11-11", { confirmedBy: "parent", checkedInAt: null, checkedOutAt: null, createdAt: new Date("2026-11-11T15:41:00Z") });
    expect(visitRow(noted).times).toBe("10:41 am");
  });
});

describe("todayCard", () => {
  it("starts with nothing to show but the check-in", () => {
    expect(todayCard(null, "Margaret")).toEqual({ step: "start" });
  });

  it("shows when Rosa checked in while she is there", () => {
    expect(todayCard(visit("2026-11-13", { checkedOutAt: null }), "Margaret")).toEqual({
      step: "visiting",
      title: "Checked in 8:30 am",
      detail: "Today’s visit · $50.00",
    });
  });

  it("counts Margaret's word as today's visit when Rosa hasn't checked in", () => {
    const noted = visit("2026-11-13", { confirmedBy: "parent", checkedInAt: null, checkedOutAt: null, createdAt: new Date("2026-11-13T15:41:00Z") });
    expect(todayCard(noted, "Margaret")).toEqual({ step: "visiting", title: "Margaret said you came today", detail: "At 10:41 am · $50.00" });
  });

  it("settles into a row once the visit is done", () => {
    const done = todayCard(visit("2026-11-13", { checkedOutAt: new Date("2026-11-13T16:45:00Z") }), "Margaret");
    expect(done).toEqual({ step: "done", row: { id: "2026-11-13", day: "Today", times: "8:30–11:45 am", pay: "$50.00" } });
  });
});

describe("weekSummary", () => {
  const closed = (over: Partial<CarePeriod> = {}): CarePeriod => ({
    startDate: "2026-11-09",
    endDate: "2026-11-13",
    status: "closed",
    payoutCents: 15000,
    paidAt: new Date("2026-11-13T20:00:00Z"),
    ...over,
  });

  it("adds up the week in cents and says pay comes when the family closes it", () => {
    expect(weekSummary(week, [], friday)).toEqual({
      count: "3 visits",
      totalCents: 15000,
      total: "$150.00",
      pay: [{ text: "Pay arrives by PayPal when the family closes the week.", settled: false }],
    });
  });

  it("has a plain line for an empty week", () => {
    expect(weekSummary([], [], friday)).toMatchObject({ count: "no visits yet", total: "$0.00" });
  });

  it("says one visit, not one visits", () => {
    expect(weekSummary(week.slice(0, 1), [], friday).count).toBe("1 visit");
  });

  it("ignores a period that is still open", () => {
    expect(weekSummary(week, [closed({ status: "open", payoutCents: null, paidAt: null })], friday).pay).toEqual([
      { text: "Pay arrives by PayPal when the family closes the week.", settled: false },
    ]);
  });

  it("says when the payout went, today or by weekday", () => {
    expect(weekSummary(week, [closed()], friday).pay).toEqual([{ text: "Paid $150.00 by PayPal today.", settled: true }]);
    expect(weekSummary(week, [closed()], new Date("2026-11-14T15:00:00Z")).pay[0]?.text).toBe("Paid $150.00 by PayPal on Friday.");
  });

  it("says the money is on its way while the week is closing", () => {
    expect(weekSummary(week, [closed({ status: "closing", payoutCents: null, paidAt: null })], friday).pay).toEqual([
      { text: "$150.00 is on its way to you by PayPal.", settled: false },
    ]);
  });

  it("keeps visits after a closed period waiting for the next close", () => {
    const period = closed({ endDate: "2026-11-11", payoutCents: 10000, paidAt: new Date("2026-11-11T20:00:00Z") });
    expect(weekSummary(week, [period], friday).pay).toEqual([
      { text: "Paid $100.00 by PayPal on Wednesday.", settled: true },
      { text: "$50.00 more arrives by PayPal when the family next closes the week.", settled: false },
    ]);
  });
});
