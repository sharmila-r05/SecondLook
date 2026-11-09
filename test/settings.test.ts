import { describe, expect, it } from "vitest";
import { parseBills } from "@/lib/family-setup";
import { evaluate } from "@/lib/risk";
import { dollarsToCents, holdWords, parseCare, parseRules, riskPolicy, SettingsError, splitRule } from "@/lib/settings";

function form(values: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

const RULES = { limitCents: "30000", dailyLimitCents: "50000", unusualMultiple: "3", holdMinutes: "10", ask: "everyone" };

describe("dollarsToCents", () => {
  it("reads typed dollars as integer cents, never through a float", () => {
    expect(dollarsToCents("50")).toBe(5000);
    expect(dollarsToCents("$84")).toBe(8400);
    expect(dollarsToCents("23.4")).toBe(2340);
    expect(dollarsToCents("23.45")).toBe(2345);
    expect(dollarsToCents("1,200.00")).toBe(120000);
    expect(dollarsToCents(" 0.10 ")).toBe(10);
  });

  it("refuses anything that isn't an amount", () => {
    for (const bad of ["", "abc", "-5", "5.123", "1e3", "$", "12.3.4"]) expect(dollarsToCents(bad)).toBeNull();
  });
});

describe("parseRules", () => {
  it("accepts only the listed choices", () => {
    expect(parseRules(form(RULES))).toEqual({ limitCents: 30000, dailyLimitCents: 50000, unusualMultiple: 3, holdMinutes: 10, ask: "everyone" });
    expect(() => parseRules(form({ ...RULES, limitCents: "12345" }))).toThrow(SettingsError);
    expect(() => parseRules(form({ ...RULES, holdMinutes: "5" }))).toThrow(SettingsError);
    expect(() => parseRules(form({ ...RULES, ask: "nobody" }))).toThrow(SettingsError);
  });

  it("won't set a daily limit below the limit for one payment", () => {
    expect(() => parseRules(form({ ...RULES, limitCents: "100000", dailyLimitCents: "50000" }))).toThrow(/daily limit/);
  });
});

describe("parseCare and splitRule", () => {
  it("reads Rosa's rate and Sarah's share; Tom has the rest", () => {
    expect(parseCare(form({ visitRate: "$55", sarahShare: "60" }))).toEqual({ visitRateCents: 5500, sarahShare: 60 });
    expect(splitRule("s", "t", 60)).toEqual({ s: 60, t: 40 });
    expect(splitRule("s", "t", 100)).toEqual({ s: 100, t: 0 });
  });

  it("keeps the rate in range", () => {
    expect(() => parseCare(form({ visitRate: "5", sarahShare: "50" }))).toThrow(SettingsError);
    expect(() => parseCare(form({ visitRate: "900", sarahShare: "50" }))).toThrow(SettingsError);
    expect(() => parseCare(form({ visitRate: "50", sarahShare: "55" }))).toThrow(SettingsError);
  });
});

describe("parseBills", () => {
  it("keeps only the ticked bills, each with its usual amount", () => {
    expect(parseBills(form({ "pay:electric": "on", "usual:electric": "90", "usual:pharmacy": "20" }))).toEqual([
      { key: "electric", usualAmountCents: 9000 },
    ]);
    expect(parseBills(form({}))).toEqual([]);
  });

  it("needs a usual amount for a ticked bill", () => {
    expect(() => parseBills(form({ "pay:pharmacy": "on", "usual:pharmacy": "" }))).toThrow(SettingsError);
  });
});

describe("the family's rules decide", () => {
  const payee = { name: "Hollowbrook Electric", known: true, perPaymentLimitCents: null, usualAmountCents: 8400 };
  const base = { text: "pay the electric bill", payee, payeeAsHeard: "electric", todaysTotalCents: 0 };

  it("holds over the family's own limit, not a fixed $300", () => {
    const strict = riskPolicy({ limitCents: 10000, dailyLimitCents: 50000, unusualMultiple: 3 });
    const relaxed = riskPolicy({ limitCents: 50000, dailyLimitCents: 100000, unusualMultiple: 5 });
    expect(evaluate({ ...base, amountCents: 20000 }, strict).rules.map((r) => r.id)).toContain("over_limit");
    expect(evaluate({ ...base, amountCents: 20000 }, relaxed).hold).toBe(false);
  });

  it("uses the family's 'times the usual'", () => {
    const twice = riskPolicy({ limitCents: 50000, dailyLimitCents: 100000, unusualMultiple: 2 });
    expect(evaluate({ ...base, amountCents: 17000 }, twice).rules.map((r) => r.chip)).toContain("2× the usual");
  });
});

describe("holdWords", () => {
  it("says a wait in plain words", () => {
    expect(holdWords(10)).toBe("10 minutes");
    expect(holdWords(60)).toBe("an hour");
    expect(holdWords(1440)).toBe("a day");
    expect(holdWords(120)).toBe("2 hours");
  });
});
