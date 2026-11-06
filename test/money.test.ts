import { describe, expect, it } from "vitest";
import { formatUsd, splitCents, toAmount, toCents } from "@/lib/money";

const sum = (shares: Record<string, number>) => Object.values(shares).reduce((a, b) => a + b, 0);

describe("toCents / toAmount", () => {
  it.each([
    ["84.00", 8400],
    ["84", 8400],
    ["84.5", 8450],
    ["0.05", 5],
    ["0.5", 50],
    ["0", 0],
    ["0.00", 0],
    ["1234567.89", 123456789],
  ])("%s ↔ %i cents", (amount, cents) => {
    expect(toCents(amount)).toBe(cents);
  });

  it.each([
    [8400, "84.00"],
    [8450, "84.50"],
    [5, "0.05"],
    [50, "0.50"],
    [0, "0.00"],
    [100, "1.00"],
    [123456789, "1234567.89"],
  ])("%i cents → %s", (cents, amount) => {
    expect(toAmount(cents)).toBe(amount);
  });

  it("round-trips", () => {
    for (const cents of [0, 1, 9, 10, 99, 100, 101, 8400, 33333, Number.MAX_SAFE_INTEGER]) {
      expect(toCents(toAmount(cents))).toBe(cents);
    }
  });

  it.each([
    "84.001",
    "-1",
    "-84.00",
    "+84.00",
    "1e3",
    "1E3",
    "",
    " 84.00",
    "84.00 ",
    "84.",
    ".50",
    "1,000.00",
    "$84.00",
    "084.00",
    "0x10",
    "Infinity",
    "NaN",
    "84,00",
    "90071992547409.92", // one cent past Number.MAX_SAFE_INTEGER
    "99999999999999999999",
  ])("rejects %j", (amount) => {
    expect(() => toCents(amount)).toThrow(RangeError);
  });

  it("accepts the largest safe amount", () => {
    expect(toCents("90071992547409.91")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("rejects non-strings and bad cents", () => {
    expect(() => toCents(84.5 as unknown as string)).toThrow(RangeError);
    expect(() => toCents(null as unknown as string)).toThrow(RangeError);
    for (const cents of [84.5, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => toAmount(cents)).toThrow(RangeError);
    }
    expect(() => toAmount("8400" as unknown as number)).toThrow(RangeError);
  });
});

describe("formatUsd", () => {
  it("adds the dollar sign and thousands separators", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(5)).toBe("$0.05");
    expect(formatUsd(8400)).toBe("$84.00");
    expect(formatUsd(150000)).toBe("$1,500.00");
    expect(formatUsd(123456789)).toBe("$1,234,567.89");
  });

  it("rejects what toAmount rejects", () => {
    expect(() => formatUsd(-1)).toThrow(RangeError);
    expect(() => formatUsd(1.5)).toThrow(RangeError);
  });
});

describe("splitCents", () => {
  it("splits an even total evenly", () => {
    expect(splitCents(10000, { sarah: 50, tom: 50 }, "sarah")).toEqual({ sarah: 5000, tom: 5000 });
  });

  it("gives the leftover cent of an odd total to the fixed person", () => {
    expect(splitCents(10001, { sarah: 50, tom: 50 }, "sarah")).toEqual({ sarah: 5001, tom: 5000 });
    expect(splitCents(10001, { sarah: 50, tom: 50 }, "tom")).toEqual({ sarah: 5000, tom: 5001 });
  });

  it("does not depend on key order", () => {
    expect(splitCents(10001, { tom: 50, sarah: 50 }, "sarah")).toEqual({ sarah: 5001, tom: 5000 });
  });

  it("handles 1 cent", () => {
    expect(splitCents(1, { sarah: 50, tom: 50 }, "tom")).toEqual({ sarah: 0, tom: 1 });
    expect(splitCents(1, { a: 1, b: 1, c: 1 }, "b")).toEqual({ a: 0, b: 1, c: 0 });
  });

  it("handles a zero total", () => {
    expect(splitCents(0, { sarah: 50, tom: 50 }, "sarah")).toEqual({ sarah: 0, tom: 0 });
  });

  it("splits three ways", () => {
    expect(splitCents(10000, { a: 1, b: 1, c: 1 }, "c")).toEqual({ a: 3333, b: 3333, c: 3334 });
    // Two leftover cents: the fixed person first, then by id.
    expect(splitCents(10001, { a: 1, b: 1, c: 1 }, "c")).toEqual({ a: 3334, b: 3333, c: 3334 });
    expect(splitCents(10000, { a: 34, b: 33, c: 33 }, "a")).toEqual({ a: 3400, b: 3300, c: 3300 });
    expect(splitCents(100, { a: 34, b: 33, c: 33 }, "b")).toEqual({ a: 34, b: 33, c: 33 });
    expect(splitCents(1, { a: 34, b: 33, c: 33 }, "c")).toEqual({ a: 1, b: 0, c: 0 });
  });

  it("uses the largest remainder before the fixed person", () => {
    // 70% of 101 = 70.7, 30% = 30.3: the 0.7 remainder wins the leftover cent.
    expect(splitCents(101, { big: 70, small: 30 }, "small")).toEqual({ big: 71, small: 30 });
  });

  it("gives nothing to a zero weight", () => {
    expect(splitCents(10001, { sarah: 50, tom: 50, rosa: 0 }, "sarah")).toEqual({ sarah: 5001, tom: 5000, rosa: 0 });
  });

  it("always sums exactly to the total", () => {
    const rules: Record<string, number>[] = [
      { a: 50, b: 50 },
      { a: 34, b: 33, c: 33 },
      { a: 1, b: 1, c: 1 },
      { a: 60, b: 25, c: 15 },
      { a: 97, b: 1, c: 1, d: 1 },
      { a: 100 },
      { a: 7, b: 11, c: 13, d: 17, e: 52 },
    ];
    for (const rule of rules) {
      for (let total = 0; total <= 1000; total += 1) {
        const shares = splitCents(total, rule, "a");
        expect(sum(shares)).toBe(total);
        for (const cents of Object.values(shares)) expect(Number.isSafeInteger(cents)).toBe(true);
      }
      const big = Number.MAX_SAFE_INTEGER;
      expect(sum(splitCents(big, rule, "a"))).toBe(big);
    }
  });

  it("rejects bad input", () => {
    expect(() => splitCents(100.5, { a: 50, b: 50 }, "a")).toThrow(RangeError);
    expect(() => splitCents(-1, { a: 50, b: 50 }, "a")).toThrow(RangeError);
    expect(() => splitCents(100, {}, "a")).toThrow(RangeError);
    expect(() => splitCents(100, { a: 50, b: 50 }, "c")).toThrow(/not in the split/);
    expect(() => splitCents(100, { a: 33.3, b: 66.7 }, "a")).toThrow(RangeError);
    expect(() => splitCents(100, { a: -50, b: 150 }, "a")).toThrow(RangeError);
    expect(() => splitCents(100, { a: 0, b: 0 }, "a")).toThrow(/all be zero/);
  });
});
