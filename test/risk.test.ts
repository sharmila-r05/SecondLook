import { describe, expect, it } from "vitest";
import { evaluate, type RiskInput } from "@/lib/risk";

const electric = { name: "Hollowbrook Electric", known: true, perPaymentLimitCents: 30000, usualAmountCents: 8400 };
const input = (over: Partial<RiskInput>): RiskInput => ({
  amountCents: 8400,
  text: "Pay the electric bill, $84",
  payee: electric,
  payeeAsHeard: "the electric bill",
  todaysTotalCents: 0,
  ...over,
});
const ids = (over: Partial<RiskInput>) => evaluate(input(over)).rules.map((r) => r.id);

describe("evaluate: the demo's two sentences", () => {
  it("lets the usual electric bill through", () => {
    expect(evaluate(input({}))).toEqual({ hold: false, rules: [] });
  });

  it("holds $1,500 to an unknown 'Microsoft support' with a hacked-computer story", () => {
    const result = evaluate(
      input({
        amountCents: 150000,
        text: "Pay $1,500 to Microsoft support, they said my computer's hacked",
        payee: null,
        payeeAsHeard: "microsoft support",
      }),
    );
    expect(result.hold).toBe(true);
    expect(result.rules.map((r) => r.id)).toEqual(["new_payee", "over_limit", "scam_wording", "daily_total"]);
    expect(result.rules.map((r) => r.chip)).toEqual(["New payee", "Over $300.00 limit", "Tech-support story", "Over $500.00 today"]);
  });
});

describe("evaluate: each rule alone", () => {
  it("new payee: unknown or unmatched", () => {
    expect(ids({ payee: null })).toEqual(["new_payee"]);
    expect(ids({ payee: { ...electric, known: false } })).toEqual(["new_payee"]);
  });

  it("over the limit: strictly over, not at it", () => {
    expect(ids({ amountCents: 30000, text: "pay" })).toEqual(["unusual_amount"]);
    expect(ids({ amountCents: 30001, text: "pay", payee: { ...electric, usualAmountCents: null } })).toEqual(["over_limit"]);
    expect(ids({ amountCents: 30000, text: "pay", payee: { ...electric, usualAmountCents: null } })).toEqual([]);
  });

  it("unusual for this payee: from exactly 3× the usual", () => {
    expect(ids({ amountCents: 8400 * 3 - 1 })).toEqual([]);
    expect(ids({ amountCents: 8400 * 3 })).toEqual(["unusual_amount"]);
  });

  it("scam wording on whole words only", () => {
    expect(ids({ text: "pay the electric bill, they want a gift card" })).toEqual(["scam_wording"]);
    expect(ids({ text: "pay for the wireless router" })).toEqual([]);
    expect(ids({ text: "send it by wire" })).toEqual(["scam_wording"]);
    expect(ids({ text: "the IRS says there's a warrant" }).filter((id) => id === "scam_wording")).toHaveLength(1);
  });

  it("asked to keep it secret, with curly apostrophes", () => {
    expect(evaluate(input({ text: "Don’t tell anyone about this" })).rules.map((r) => r.chip)).toEqual(["Asked to keep it secret"]);
  });

  it("urgency", () => {
    expect(ids({ text: "pay it right now" })).toEqual(["urgency"]);
  });

  it("daily total: over the limit counting today's other payments", () => {
    expect(ids({ todaysTotalCents: 50000 - 8400 })).toEqual([]);
    expect(ids({ todaysTotalCents: 50000 - 8400 + 1 })).toEqual(["daily_total"]);
  });
});
