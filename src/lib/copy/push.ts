// What buzzes on Sarah's and Tom's phones. Written for the children, like their screen: it says plainly what Mom is
// trying to do and what happened, never blames her, and carries no score.

import { herWords } from "@/lib/copy/family";
import { formatUsd } from "@/lib/money";

export interface PushMessage {
  title: string;
  body: string;
  /** One alert per payment: a later message with the same tag replaces the earlier one on the phone. */
  tag: string;
  /** Collapses an undelivered alert into a newer one at the push service (at most 32 URL-safe characters). */
  topic: string;
  /** How long the push service keeps trying a phone that's offline. */
  ttlSeconds: number;
  urgency: "normal" | "high";
}

interface Payment {
  id: string;
  payeeName: string;
  amountCents: number;
  /** What Margaret said when she asked to pay it: what the payment is for. */
  said?: string;
  /** Why it waits for family: the held card's chips. */
  rules?: readonly { chip: string }[];
}

function keysFor(requestId: string) {
  return { tag: `look-${requestId}`, topic: requestId.replace(/-/g, "").slice(0, 32) };
}

/** At most this much of her words in the alert, so the reasons still fit on a lock screen. */
const ALERT_WORDS = 110;

/**
 * A payment was just held for family: the alert that matters, readable from the lock screen. The title says who and
 * how much, the body what it's for in her own words and why it waits for them (the held card's chips). It lasts as
 * long as the hold does.
 */
export function holdMessage(payment: Payment, holdMinutes: number): PushMessage {
  const said = payment.said?.trim() ? `She said: “${herWords(payment.said, ALERT_WORDS)}”` : null;
  const why = (payment.rules ?? []).map((r) => r.chip).join(" · ");
  return {
    title: `Mom wants to pay ${formatUsd(payment.amountCents)} to ${payment.payeeName}`,
    // The reasons on their own line under her words; a phone that shows one line reads it as a space.
    body: [said, why || null].filter(Boolean).join("\n") || "Tap to take a second look.",
    ...keysFor(payment.id),
    ttlSeconds: Math.max(60, Math.round(holdMinutes * 60)),
    urgency: "high",
  };
}

/** The other sibling answered first. Replaces the waiting alert, so nobody opens a payment that's already settled. */
export function decidedMessage(payment: Payment, by: string, decision: "approve" | "deny"): PushMessage {
  const amount = formatUsd(payment.amountCents);
  return {
    title: `${by} took the second look`,
    body:
      decision === "deny"
        ? `${by} said no to ${amount} to ${payment.payeeName}. The money never left Mom’s account.`
        : `${by} approved ${amount} to ${payment.payeeName}. It’s being paid now.`,
    ...keysFor(payment.id),
    ttlSeconds: 60 * 60,
    urgency: "normal",
  };
}

/** Where tapping the alert opens: each child's own view of the family screen. */
export function familyPath(memberName: string): string {
  return memberName === "Tom" ? "/family?as=tom" : "/family";
}
