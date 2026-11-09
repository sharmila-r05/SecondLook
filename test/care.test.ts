import { describe, expect, it } from "vitest";
import { invoiceNumber, periodSpan, shareOut } from "@/lib/care";
import type { Member } from "@/lib/family";

const members: Member[] = [
  { id: "m", name: "Margaret", role: "parent", joinedAt: null },
  { id: "s", name: "Sarah", role: "child", joinedAt: null },
  { id: "t", name: "Tom", role: "child", joinedAt: null },
  { id: "r", name: "Rosa", role: "aide", joinedAt: null },
];

describe("shareOut", () => {
  it("splits Rosa's pay between Sarah and Tom, in whole cents that add up", () => {
    expect(shareOut(15000, { s: 50, t: 50 }, members)).toEqual([
      { memberId: "s", name: "Sarah", amountCents: 7500 },
      { memberId: "t", name: "Tom", amountCents: 7500 },
    ]);
  });

  it("gives the leftover cent of an odd total to Sarah", () => {
    const shares = shareOut(15001, { s: 50, t: 50 }, members);
    expect(shares.map((s) => s.amountCents)).toEqual([7501, 7500]);
    expect(shares.reduce((sum, s) => sum + s.amountCents, 0)).toBe(15001);
  });

  it("follows an uneven split", () => {
    expect(shareOut(10000, { s: 70, t: 30 }, members).map((s) => s.amountCents)).toEqual([7000, 3000]);
  });
});

describe("invoiceNumber", () => {
  it("stays within PayPal's 25 characters and is fixed for a period and person", () => {
    const id = "f46d0c68-ec57-4752-9a1b-0123456789ab";
    expect(invoiceNumber(id, "Sarah")).toBe("SL-F46D0C68EC574752-SARA");
    expect(invoiceNumber(id, "Tom")).toBe("SL-F46D0C68EC574752-TOM");
    expect(invoiceNumber(id, "Sarah").length).toBeLessThanOrEqual(25);
  });
});

describe("periodSpan", () => {
  it.each([
    ["2026-11-05", "2026-11-05", "Nov 5"],
    ["2026-11-05", "2026-11-09", "Nov 5–9"],
    ["2026-10-30", "2026-11-02", "Oct 30–Nov 2"],
  ])("%s to %s reads %s", (startDate, endDate, expected) => {
    expect(periodSpan(startDate, endDate)).toBe(expected);
  });
});
