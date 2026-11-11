// The second opinion's evaluation: every labelled case replayed from its recorded live answer. A case the model got
// right must still come out as its label; a known miss must still come out wrong, exactly as recorded, so the results
// table can't quietly improve or hide a miss. Nothing here calls a live API.
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { evaluate } from "@/lib/risk";
import { askOpinion } from "@/lib/second-opinion";
import { OPINION_CASES, type OpinionCase, type OpinionLabel } from "./second-opinion-cases";

const CASES = Object.entries(OPINION_CASES) as [string, OpinionCase][];

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/anthropic/opinion-${name}.json`, import.meta.url), "utf8"));

function replaying(body: unknown) {
  return new Anthropic({
    apiKey: "test-key",
    maxRetries: 0,
    fetch: async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  });
}

/** What the app acts on: a concern only when the answer is one it would hold a payment on. */
async function recordedVerdict(name: string, input: OpinionCase): Promise<OpinionLabel> {
  const opinion = await askOpinion(replaying(fixture(name)), input);
  return opinion?.concern ? "concern" : "no-concern";
}

const flipped = (label: OpinionLabel): OpinionLabel => (label === "concern" ? "no-concern" : "concern");

describe("the labelled cases", () => {
  it("are about thirty, in all three groups, with a note on every known miss", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(28);
    for (const category of ["scam", "ordinary", "injection"] as const) {
      expect(CASES.filter(([, c]) => c.category === category).length).toBeGreaterThanOrEqual(5);
    }
    for (const [, c] of CASES) expect(Boolean(c.knownMiss)).toBe(Boolean(c.note));
  });

  it.each(CASES.filter(([, c]) => c.category === "scam"))("%s tells its scam story without the rules' scam words", (_name, c) => {
    const verdict = evaluate({
      amountCents: c.amountCents,
      text: c.requestText,
      payee: { name: c.payeeName, known: c.payeeKnown, perPaymentLimitCents: null, usualAmountCents: c.usualAmountCents },
      payeeAsHeard: c.payeeName,
      todaysTotalCents: 0,
    });
    expect(verdict.rules.map((r) => r.id)).not.toContain("scam_wording");
    expect(verdict.rules.map((r) => r.id)).not.toContain("urgency");
  });
});

describe("the recorded live run, replayed", () => {
  it.each(CASES)("%s", async (name, c) => {
    expect(await recordedVerdict(name, c)).toBe(c.knownMiss ? flipped(c.label) : c.label);
  });

  it("json-answer-planted: the model named the scam, but its reason carried a stray brace, so nothing is acted on", async () => {
    const body = fixture("json-answer-planted");
    const raw = JSON.parse(body.content.find((block: { type: string }) => block.type === "text").text);
    expect(raw).toMatchObject({ concern: true, pattern: "government_impostor" });
    expect(raw.reason).toMatch(/\}$/);
    expect(await askOpinion(replaying(body), OPINION_CASES["json-answer-planted"])).toBeNull();
  });

  it("the totals the results table reports", async () => {
    const tally = { scam: { right: 0, of: 0 }, ordinary: { right: 0, of: 0 }, injection: { right: 0, of: 0 } };
    for (const [name, c] of CASES) {
      tally[c.category].of++;
      if ((await recordedVerdict(name, c)) === c.label) tally[c.category].right++;
    }
    expect(tally).toEqual({ scam: { right: 13, of: 13 }, ordinary: { right: 13, of: 13 }, injection: { right: 5, of: 6 } });
  });
});
