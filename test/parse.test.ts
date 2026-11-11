import { describe, expect, it } from "vitest";
import { matchPayee, parseRequest, payeeDisplayName } from "@/lib/parse";

describe("parseRequest", () => {
  it("reads the demo's bill sentences", () => {
    expect(parseRequest("Pay the electric bill, $84")).toEqual({ kind: "bill", payeeText: "electric", amountCents: 8400, reason: "" });
    expect(parseRequest("Pay $1,500 to Microsoft support, they said my computer's hacked")).toEqual({
      kind: "bill",
      payeeText: "microsoft support",
      amountCents: 150000,
      reason: "said my computer's hacked",
    });
  });

  it("takes cents and spoken dollars", () => {
    expect(parseRequest("pay the pharmacy $23.40")).toMatchObject({ payeeText: "pharmacy", amountCents: 2340 });
    expect(parseRequest("Pay Elmwood Pharmacy 23 dollars")).toMatchObject({ payeeText: "elmwood pharmacy", amountCents: 2300 });
  });

  it("recognises a visit", () => {
    expect(parseRequest("Rosa came today")).toEqual({ kind: "visit" });
  });

  it("returns null for what it can't read (the AI model takes those)", () => {
    expect(parseRequest("pay the electric bill eighty four dollars")).toBeNull();
    expect(parseRequest("hello")).toBeNull();
  });
});

describe("matchPayee", () => {
  const payees = [
    { id: "e", name: "Hollowbrook Electric", aliases: ["electric", "electric bill", "power company"] },
    { id: "p", name: "Elmwood Pharmacy", aliases: ["pharmacy", "prescriptions"] },
  ];

  it("matches names and aliases loosely", () => {
    expect(matchPayee("the electric bill", payees)?.id).toBe("e");
    expect(matchPayee("electric", payees)?.id).toBe("e");
    expect(matchPayee("the power company", payees)?.id).toBe("e");
    expect(matchPayee("elmwood pharmacy", payees)?.id).toBe("p");
  });

  it("treats anyone else as new", () => {
    expect(matchPayee("microsoft support", payees)).toBeNull();
    expect(matchPayee("tech support line", payees)).toBeNull();
  });
});

describe("large amounts and names as she meant them", () => {
  it("reads the amounts scams ask for", () => {
    expect(parseRequest("Pay $15,000 to my grandson for bail")).toMatchObject({ kind: "bill", amountCents: 1_500_000 });
    expect(parseRequest("Pay my grandson $12,000")).toMatchObject({ kind: "bill", payeeText: "grandson", amountCents: 1_200_000 });
  });

  it("keeps acronyms and her own capitals", () => {
    expect(payeeDisplayName("irs", "pay the irs $600")).toBe("IRS");
    expect(payeeDisplayName("irs", "Pay $600 to the IRS")).toBe("IRS");
    expect(payeeDisplayName("tech support", "pay $1,500 to tech support")).toBe("Tech Support");
    expect(payeeDisplayName("mckinley plumbing", "Pay McKinley Plumbing $90")).toBe("McKinley Plumbing");
  });
});
