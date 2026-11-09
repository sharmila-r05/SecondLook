import { describe, expect, it } from "vitest";
import { topUpAmount } from "@/lib/balance";

describe("topUpAmount", () => {
  it("tops up $2,000 for an ordinary payout", () => {
    expect(topUpAmount(15000)).toBe(200000);
  });

  it("covers a large payout with $500 to spare, in whole $100s", () => {
    expect(topUpAmount(180000)).toBe(230000);
    expect(topUpAmount(180001)).toBe(240000);
  });
});
