// What Sarah's and Tom's screen says about a payment that went to family for a second look. Factual and brief; it may
// name the scam pattern plainly (only Margaret's screen never does), and it never blames her.

import { formatUsd } from "@/lib/money";
import type { RuleHit } from "@/lib/risk";
import type { PaymentRequestState } from "@/lib/states";
import { formatTime } from "@/lib/time";

export interface SecondLook {
  id: string;
  status: PaymentRequestState;
  payee: string;
  amountCents: number;
  /** What Margaret said or typed when she asked to pay it: what the payment is for, in her words. */
  said: string;
  at: Date;
  note: string | null;
  rules: RuleHit[];
  holdExpiresAt: Date | null;
  decidedBy: string | null;
  decidedAt: Date;
}

export type CardTone = "waiting" | "settled" | "released";

export interface FamilyCard {
  id: string;
  tone: CardTone;
  open: boolean;
  title: string;
  when: string;
  outcome: string | null;
}

export function familyCard(item: SecondLook): FamilyCard {
  const amount = formatUsd(item.amountCents);
  const base = { id: item.id, when: formatTime(item.at) };
  switch (item.status) {
    case "held":
      return { ...base, tone: "waiting", open: true, title: `Mom is trying to pay ${amount} to ${item.payee}`, outcome: null };
    case "approved_by_family":
    case "paid":
      return {
        ...base,
        tone: "settled",
        open: false,
        title: `${item.decidedBy ?? "Family"} approved ${amount} to ${item.payee}`,
        outcome: item.status === "paid" ? `Paid at ${formatTime(item.decidedAt)}.` : "Paying now.",
      };
    case "denied":
    case "voided":
      return item.decidedBy
        ? {
            ...base,
            tone: "released",
            open: false,
            title: `${item.decidedBy} said no to ${amount} to ${item.payee}`,
            outcome: "The hold was cancelled. The money never left Mom’s account.",
          }
        : {
            ...base,
            tone: "released",
            open: false,
            title: `Nobody answered in time: ${amount} to ${item.payee}`,
            outcome: "The hold was cancelled. The money never left Mom’s account.",
          };
    case "expired":
      return { ...base, tone: "released", open: false, title: `Nobody answered in time: ${amount} to ${item.payee}`, outcome: "Cancelling the hold." };
    default:
      return { ...base, tone: "settled", open: false, title: `${amount} to ${item.payee}`, outcome: null };
  }
}

/**
 * Her words as she said them, on one line and cut at a word near `max` characters, for the held card and the alert.
 * Quoted by the caller; the words are hers, so they are never reworded.
 */
export function herWords(text: string, max = 240): string {
  const words = text.replace(/\s+/g, " ").trim().replace(/^["“”']+|["“”']+$/g, "");
  if (words.length <= max) return words;
  const cut = words.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : words.slice(0, max)).replace(/[\s,;:.]+$/, "")}…`;
}

export function cancelsAt(item: SecondLook): string | null {
  return item.holdExpiresAt ? `Cancels itself at ${formatTime(item.holdExpiresAt)} if nobody answers.` : null;
}
