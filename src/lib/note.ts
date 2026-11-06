// The note the family reads with a held payment. The rules already decided; this only explains. The template is
// always available, so a hold never waits on the AI model.

import { formatUsd } from "@/lib/money";
import type { RuleHit } from "@/lib/risk";

export function templateNote(input: { payeeName: string; amountCents: number; rules: readonly RuleHit[] }): string {
  const facts = input.rules.map((r) => `${r.fact.charAt(0).toUpperCase()}${r.fact.slice(1)}.`).join(" ");
  return `Mom is trying to pay ${formatUsd(input.amountCents)} to ${input.payeeName}. ${facts}`.trim();
}
