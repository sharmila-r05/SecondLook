// Rules decide, the AI explains (brief §6). This is the decision: one pure function, no I/O, no model. A payment is
// held for family when any rule fires; each hit carries a short chip and a plain fact for the family's alert.

import { formatUsd } from "@/lib/money";

export type RuleId = "new_payee" | "over_limit" | "unusual_amount" | "scam_wording" | "urgency" | "daily_total" | "second_opinion";

export interface RuleHit {
  id: RuleId;
  /** Short label shown as a chip beside the AI's note. */
  chip: string;
  /** The fact behind it, in plain words. */
  fact: string;
}

export interface RiskInput {
  amountCents: number;
  /** What Margaret said or typed, as heard. */
  text: string;
  /** The matched payee, or null when nobody on the family's list matched. */
  payee: { name: string; known: boolean; perPaymentLimitCents: number | null; usualAmountCents: number | null } | null;
  /** The name as Margaret said it, for an unmatched payee. */
  payeeAsHeard: string;
  /** Today's other payments in her time zone, excluding any that were cancelled. */
  todaysTotalCents: number;
  /**
   * Claude's second opinion (second-opinion.ts), when it heard a scam story in her words. It can only add a hold:
   * without it, or when the model is off, the rules above decide alone.
   */
  secondOpinion?: { chip: string; reason: string } | null;
}

export interface RiskPolicy {
  defaultLimitCents: number;
  dailyLimitCents: number;
  unusualMultiple: number;
}

export const DEFAULT_POLICY: RiskPolicy = { defaultLimitCents: 30000, dailyLimitCents: 50000, unusualMultiple: 3 };

// Each group yields at most one chip. Phrases match on whole words, so "wire" never matches "wireless".
const SCAM_GROUPS: { chip: string; phrases: string[] }[] = [
  {
    chip: "Tech-support story",
    phrases: ["tech support", "technical support", "computer support", "microsoft", "apple support", "virus", "hacked", "hacker", "remote access", "refund department"],
  },
  { chip: "Gift cards", phrases: ["gift card", "gift cards", "google play", "itunes", "steam card", "prepaid card"] },
  { chip: "Crypto or wire", phrases: ["bitcoin", "crypto", "cryptocurrency", "wire", "wire transfer", "western union", "moneygram", "zelle"] },
  { chip: "Government threat", phrases: ["irs", "social security", "medicare", "warrant", "arrest", "arrested", "police", "sheriff", "fbi", "lawsuit"] },
  { chip: "Family emergency", phrases: ["grandson", "granddaughter", "jail", "bail", "lawyer"] },
  { chip: "Asked to keep it secret", phrases: ["don't tell", "do not tell", "keep this secret", "keep it secret", "between us"] },
];

const URGENCY = ["right now", "immediately", "right away", "urgent", "urgently", "asap", "today or", "before it's too late", "or else", "last chance", "within the hour", "they'll arrest"];

/** Lowercase, straight apostrophes, punctuation to spaces, single spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^a-z0-9'$ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A chip's amount: whole dollars when there are no cents ("$300"), otherwise exact ("$300.50"). Display only. */
export function chipUsd(cents: number): string {
  const full = formatUsd(cents);
  return cents % 100 === 0 ? full.slice(0, -3) : full;
}

function containsPhrase(normalized: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9'])${escaped}($|[^a-z0-9'])`).test(normalized);
}

export function evaluate(input: RiskInput, policy: RiskPolicy = DEFAULT_POLICY): { hold: boolean; rules: RuleHit[] } {
  const rules: RuleHit[] = [];
  const { amountCents, payee } = input;
  const amount = formatUsd(amountCents);
  const text = normalize(input.text);

  if (!payee || !payee.known) {
    rules.push({ id: "new_payee", chip: "New payee", fact: `${payee?.name ?? input.payeeAsHeard} isn’t on the family’s list` });
  }

  const limit = payee?.perPaymentLimitCents ?? policy.defaultLimitCents;
  if (amountCents > limit) {
    rules.push({ id: "over_limit", chip: `Over ${chipUsd(limit)} limit`, fact: `${amount} is over her ${formatUsd(limit)} limit` });
  }

  const usual = payee?.usualAmountCents;
  if (payee?.known && usual && amountCents >= usual * policy.unusualMultiple) {
    rules.push({
      id: "unusual_amount",
      chip: `${policy.unusualMultiple}× the usual`,
      fact: `${amount} is at least ${policy.unusualMultiple} times the usual ${formatUsd(usual)} for ${payee.name}`,
    });
  }

  for (const group of SCAM_GROUPS) {
    const heard = group.phrases.find((p) => containsPhrase(text, p));
    if (heard) rules.push({ id: "scam_wording", chip: group.chip, fact: `She mentioned “${heard}”` });
  }

  const rushed = URGENCY.find((p) => containsPhrase(text, p));
  if (rushed) rules.push({ id: "urgency", chip: "Urgent wording", fact: `She said “${rushed}”` });

  if (input.todaysTotalCents + amountCents > policy.dailyLimitCents) {
    rules.push({
      id: "daily_total",
      chip: `Over ${chipUsd(policy.dailyLimitCents)} today`,
      fact: `${formatUsd(input.todaysTotalCents + amountCents)} today with this payment, over her ${formatUsd(policy.dailyLimitCents)} daily limit`,
    });
  }

  // Claude adds its reading only when the scam-word lists didn't already name the story.
  if (input.secondOpinion && !rules.some((r) => r.id === "scam_wording")) {
    rules.push({ id: "second_opinion", chip: `Claude: ${input.secondOpinion.chip}`, fact: input.secondOpinion.reason });
  }

  return { hold: rules.length > 0, rules };
}
