// The note the family reads with a held payment. The rules already decided; this only explains. The card's title already
// says who and how much, so the note gives the reasons. The template is always available, so a hold never waits on the
// AI model.

import type { RuleHit } from "@/lib/risk";

export function templateNote(input: { payeeName: string; amountCents: number; rules: readonly RuleHit[] }): string {
  return input.rules.map((r) => `${r.fact.charAt(0).toUpperCase()}${r.fact.slice(1)}.`).join(" ");
}
