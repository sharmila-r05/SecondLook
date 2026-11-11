import { describe, expect, it } from "vitest";
import { cancelsAt, familyCard, herWords, type SecondLook } from "@/lib/copy/family";

// 15:41 UTC on 6 Nov 2026 is 10:41 am in New York (EST).
const at = new Date("2026-11-06T15:41:00Z");
const held: SecondLook = {
  id: "r1",
  status: "held",
  payee: "Tech Support Line",
  amountCents: 150000,
  said: "Pay $1,500 to tech support, they said my computer is hacked",
  at,
  note: "Tech Support Line isn’t on the family’s list.",
  noteByModel: false,
  rules: [{ id: "new_payee", chip: "New payee", fact: "Tech Support Line isn’t on the family’s list" }],
  holdExpiresAt: new Date("2026-11-06T15:51:00Z"),
  decidedBy: null,
  decidedAt: at,
};

describe("familyCard", () => {
  it("opens a held payment for a decision, with who and how much in the title", () => {
    const card = familyCard(held);
    expect(card).toMatchObject({ tone: "waiting", open: true, title: "Mom is trying to pay $1,500.00 to Tech Support Line", when: "10:41 am" });
    expect(cancelsAt(held)).toBe("Cancels itself at 10:51 am if nobody answers.");
  });

  it("names who approved and when it was paid", () => {
    const card = familyCard({ ...held, status: "paid", decidedBy: "Tom", decidedAt: new Date("2026-11-06T15:44:00Z") });
    expect(card).toMatchObject({ tone: "settled", open: false, title: "Tom approved $1,500.00 to Tech Support Line", outcome: "Paid at 10:44 am." });
  });

  it("says the money never left when someone said no", () => {
    for (const status of ["denied", "voided"] as const) {
      const card = familyCard({ ...held, status, decidedBy: "Sarah" });
      expect(card).toMatchObject({ tone: "released", open: false, title: "Sarah said no to $1,500.00 to Tech Support Line" });
      expect(card.outcome).toContain("never left Mom’s account");
    }
  });

  it("tells the family when nobody answered in time", () => {
    expect(familyCard({ ...held, status: "expired" })).toMatchObject({ tone: "released", title: "Nobody answered in time: $1,500.00 to Tech Support Line" });
    expect(familyCard({ ...held, status: "voided" }).outcome).toContain("never left Mom’s account");
  });

  it("has no expiry line once a hold has none", () => {
    expect(cancelsAt({ ...held, holdExpiresAt: null })).toBeNull();
  });
});

describe("herWords", () => {
  it("keeps her words as she said them, on one line, without the quotes around them", () => {
    expect(herWords("  Pay the electric bill,\n  $84 ")).toBe("Pay the electric bill, $84");
    expect(herWords("“Pay $1,500 to tech support”")).toBe("Pay $1,500 to tech support");
  });

  it("cuts a long request at a word, with an ellipsis", () => {
    const words = herWords("Pay the man from the bank five hundred dollars today because he says my account is frozen", 40);
    expect(words).toBe("Pay the man from the bank five hundred…");
    expect(words.length).toBeLessThanOrEqual(41);
  });
});
