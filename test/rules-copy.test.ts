import { describe, expect, it } from "vitest";
import { ALWAYS_WORDS, amountText, dollars, peopleRows, type PersonInput, refusal, shareWords, timesWords, waitWords } from "@/app/family/rules-copy";
import { evaluate } from "@/lib/risk";
import { CHOICES, USUAL_AMOUNT_RANGE, VISIT_RATE_RANGE } from "@/lib/settings";

describe("the Rules tab's choices", () => {
  it("reads each limit, multiple, wait and split as a choice", () => {
    expect(CHOICES.limitCents.map(dollars)).toEqual(["$100", "$200", "$300", "$500", "$1,000"]);
    expect(dollars(2340)).toBe("$23.40");
    expect(amountText(150000)).toBe("1500.00");
    expect(timesWords(3)).toBe("3× the usual");
    expect(CHOICES.holdMinutes.map(waitWords)).toEqual(["10 minutes", "1 hour", "1 day"]);
    expect(CHOICES.sarahShare.map(shareWords)).toEqual([
      "Tom pays it all",
      "Sarah 30%, Tom 70%",
      "Sarah 40%, Tom 60%",
      "Half each",
      "Sarah 60%, Tom 40%",
      "Sarah 70%, Tom 30%",
      "Sarah pays it all",
    ]);
  });
});

describe("ALWAYS_WORDS", () => {
  it("lists only wording the risk rules really send for a second look, each with its own chip", () => {
    for (const { chip, example } of ALWAYS_WORDS) {
      const known = { name: "Hollowbrook Electric", known: true, perPaymentLimitCents: null, usualAmountCents: 8400 };
      const { hold, rules } = evaluate({ amountCents: 1000, text: example, payee: known, payeeAsHeard: "", todaysTotalCents: 0 });
      expect(hold).toBe(true);
      expect(rules.map((r) => r.chip)).toEqual([chip]);
    }
  });
});

describe("refusal", () => {
  it("says the range an amount must be in, and typesets the server's words", () => {
    expect(refusal("Rosa's rate isn't an amount in range", VISIT_RATE_RANGE)).toBe("Rosa’s rate should be from $10 to $500.");
    expect(refusal("The usual amount for Elmwood Pharmacy isn't an amount in range", USUAL_AMOUNT_RANGE)).toBe(
      "The usual amount for Elmwood Pharmacy should be from $1 to $5,000.",
    );
    expect(refusal("The daily limit can't be below the limit for one payment")).toBe("The daily limit can’t be below the limit for one payment.");
  });
});

describe("peopleRows", () => {
  const members: PersonInput[] = [
    { id: "r", name: "Rosa", role: "aide", joinedAt: null },
    { id: "s", name: "Sarah", role: "child", joinedAt: null },
    { id: "t", name: "Tom", role: "child", joinedAt: null },
    { id: "m", name: "Margaret", role: "parent", joinedAt: null },
  ];
  const base = { members, organizerId: "t", origin: "setup" as const, viewer: "Sarah" as const, parentAgreed: false, paypalConnected: false };

  it("puts Mom first, then whoever set the family up, the other sibling and Rosa, each as the viewer knows them", () => {
    const rows = peopleRows(base);
    expect(rows.map((r) => `${r.name} · ${r.relation}`)).toEqual(["Margaret · Mom", "Tom · Your brother", "Sarah · You", "Rosa · Mom’s aide"]);
    expect(rows.find((r) => r.name === "Tom")).toMatchObject({ status: "Set up the family", done: true, fabric: "var(--tom)" });
  });

  it("shows who hasn't opened their invite in a family someone set up", () => {
    const rows = peopleRows(base);
    expect(rows.find((r) => r.name === "Margaret")).toMatchObject({ status: "Hasn’t opened her invite yet", done: false });
    expect(rows.find((r) => r.name === "Rosa")).toMatchObject({ status: "Hasn’t opened the invite yet", done: false });
    const joined = peopleRows({ ...base, members: members.map((m) => ({ ...m, joinedAt: new Date() })) });
    expect(joined.find((r) => r.name === "Rosa")).toMatchObject({ status: "Joined", done: true });
    expect(joined.find((r) => r.name === "Margaret")).toMatchObject({ status: "Opened her invite, hasn’t said yes yet", done: false });
  });

  it("follows Mom from saying yes to connecting her PayPal", () => {
    expect(peopleRows({ ...base, parentAgreed: true })[0]).toMatchObject({ status: "Said yes · PayPal not connected yet", done: false });
    expect(peopleRows({ ...base, parentAgreed: true, paypalConnected: true })[0]).toMatchObject({ status: "Said yes · PayPal connected", done: true });
  });

  it("counts everyone in the ready-made family as joined", () => {
    const rows = peopleRows({ ...base, origin: "ready", organizerId: "s", viewer: "Tom", parentAgreed: true, paypalConnected: true });
    expect(rows.map((r) => [r.relation, r.status])).toEqual([
      ["Mom", "Said yes · PayPal connected"],
      ["Your sister", "Set up the family"],
      ["You", "Joined"],
      ["Mom’s aide", "Joined"],
    ]);
  });
});
