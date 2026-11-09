import { describe, expect, it } from "vitest";
import { type BillState, orderForParent, type ParentEntry, parentLine } from "@/lib/copy/parent";

const at = new Date("2026-11-06T15:41:00Z"); // 10:41 am in Ohio
const STATES: BillState[] = ["processing", "paid", "waiting", "approved", "declined", "expired"];
const bill = (state: BillState): ParentEntry => ({
  kind: "bill",
  id: state,
  state,
  payee: "Tech Support Line",
  amountCents: 150000,
  at,
  familyMember: "Sarah",
});

describe("parentLine", () => {
  it("never shames Margaret or names the mechanism (hard rule 2)", () => {
    for (const state of STATES) {
      const { title, amount, detail } = parentLine(bill(state));
      expect(`${title} ${amount ?? ""} ${detail}`).not.toMatch(/scam|fraud|hold|authori[sz]|risk|suspicious|blocked|warning|alert/i);
    }
  });

  it("says a held payment was sent to family to double-check, with its facts", () => {
    expect(parentLine(bill("waiting"))).toMatchObject({
      mark: "waiting",
      stitch: "basting",
      title: "Sent to Sarah to double-check",
      amount: "$1,500.00",
      detail: "to Tech Support Line · 10:41\u00a0am",
    });
  });

  it("says plainly when nothing was paid", () => {
    expect(parentLine(bill("declined")).title).toBe("Sarah said no, nothing was paid");
    expect(parentLine(bill("expired")).title).toBe("Nothing was paid");
  });

  it("describes a visit", () => {
    const line = parentLine({ kind: "visit", id: "v", aide: "Rosa", at: new Date("2026-11-06T13:30:00Z") });
    expect(line).toMatchObject({ title: "Rosa came today", detail: "8:30\u00a0am", mark: "settled" });
  });
});

describe("orderForParent", () => {
  it("puts what's waiting first, then newest first", () => {
    const earlier = { ...bill("paid"), id: "paid", at: new Date("2026-11-06T14:12:00Z") };
    const later = { ...bill("paid"), id: "later", at: new Date("2026-11-06T16:00:00Z") };
    const waiting = { ...bill("waiting"), id: "waiting", at: new Date("2026-11-06T13:00:00Z") };
    expect(orderForParent([earlier, later, waiting]).map((e) => e.id)).toEqual(["waiting", "later", "paid"]);
  });
});

describe("templateNote", () => {
  it("states each rule's fact as its own sentence, without repeating the card title", async () => {
    const { templateNote } = await import("@/lib/note");
    expect(
      templateNote({
        payeeName: "Microsoft Support",
        amountCents: 150000,
        rules: [
          { id: "new_payee", chip: "New payee", fact: "Microsoft Support isn’t on the family’s list" },
          { id: "scam_wording", chip: "Tech-support story", fact: 'she mentioned “hacked”' },
        ],
      }),
    ).toBe("Microsoft Support isn’t on the family’s list. She mentioned “hacked”.");
  });
});

describe("CONNECT_COPY", () => {
  it("asks her to connect PayPal in plain words, never naming the mechanism (hard rule 2)", async () => {
    const { CONNECT_COPY } = await import("@/lib/copy/parent");
    for (const text of Object.values(CONNECT_COPY)) {
      expect(text).not.toMatch(/scam|fraud|hold|authori[sz]|risk|suspicious|blocked|warning|alert|vault|token|agreement/i);
    }
    expect(CONNECT_COPY.body).toMatch(/Only bills you say yes to are paid/);
  });
});
