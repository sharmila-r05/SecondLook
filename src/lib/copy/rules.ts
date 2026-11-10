// What the family's own settings are called, wherever Sarah or Tom meet them: the setup steps and the Rules tab say the
// same words for the same setting, and name each choice the same way. Family copy may name a scam pattern plainly; it
// never blames Mom.

import { formatUsd } from "@/lib/money";
import { CHOICES, holdWords } from "@/lib/settings";

/** The split's choices in the order both forms list them: Sarah's share first, from all of it to none. */
export const SHARES = [...CHOICES.sarahShare].sort((a, b) => b - a);

/** "$300" for whole dollars, "$23.40" otherwise: how a limit or a range reads. */
export function dollars(cents: number): string {
  const full = formatUsd(cents);
  return cents % 100 === 0 ? full.slice(0, -3) : full;
}

/** Each setting's name and the sentence under it. */
export const RULES_COPY = {
  limit: {
    label: "One payment is over",
    help: "Any single payment above this, to anyone, even a bill she pays every month.",
  },
  daily: {
    label: "A day’s payments come to over",
    help: "When everything Mom pays in a day adds up to more than this.",
  },
  unusual: {
    label: "A regular bill far above its usual",
    help: "When a bill Mom pays every month comes in at this many times its usual amount.",
  },
  always: {
    label: "Always, whatever the amount",
    help: "Anyone Mom hasn’t paid before, and anything she says that sounds like one of these. They can’t be switched off.",
    chips: "Words that always get a second look",
    claude:
      "Claude also reads what she says for a scam story told in other words, like a call threatening to cut off her power tonight. Claude can add a second look, never remove one.",
  },
  ask: { label: "Who gets asked" },
  hold: {
    label: "If nobody answers, cancel it after",
    help: "Cancelled means nothing is paid: the money never leaves Mom’s PayPal.",
  },
  split: {
    help: "Sarah’s part first, then Tom’s, in percent.",
  },
} as const;

/** The daily limit can't be below one payment's: said under the daily choices, with the limit it must meet. */
export const dailyFloor = (limitCents: number) => `Not below the limit for one payment: ${dollars(limitCents)} or more.`;

/** The lowest day's limit that goes with a one-payment limit: where the day's limit is raised to when it falls behind. */
export const lowestDaily = (limitCents: number): number =>
  CHOICES.dailyLimitCents.find((c) => c >= limitCents) ?? Math.max(...CHOICES.dailyLimitCents);

/** "Rosa’s pay per visit" (the Rules tab sets her name in her sage, then the rest). */
export const RATE_AFTER_NAME = "’s pay per visit";
export const rateLabel = (aide: string) => `${aide}${RATE_AFTER_NAME}`;

/** The range a visit's pay is typed in: "Anything from $10 to $500." */
export const rateRange = (range: { minCents: number; maxCents: number }) => `Anything from ${dollars(range.minCents)} to ${dollars(range.maxCents)}.`;

/** "How you and Tom split it", to whichever sibling is looking. */
export const splitLabel = (otherSibling: string) => `How you and ${otherSibling} split it`;

/** A regular bill's multiple as a choice: "3 times". */
export const timesWords = (n: number) => `${n} times`;

/** How long a payment waits for family, as a choice: "10 minutes", "1 hour", "1 day". */
export const waitWords = (minutes: number) => holdWords(minutes).replace(/^an? /, "1 ");

/** Sarah's share of care costs and Tom's, as a choice shows it: "60 / 40" (Sarah's first). */
export const shareWords = (sarahShare: number) => `${sarahShare} / ${100 - sarahShare}`;

/** The same choice spoken in full: "Sarah 60%, Tom 40%". */
export const shareName = (sarahShare: number) => `Sarah ${sarahShare}%, Tom ${100 - sarahShare}%`;

/**
 * Who gets asked about a held payment, in the words of whichever sibling is looking: the one who set the family up
 * reads "Tom and me" and "Just me"; the other reads "Sarah and me" and "Just Sarah".
 */
export function askChoices({ viewer, organizer, sibling }: { viewer: string; organizer: string; sibling: string }) {
  const mine = viewer === organizer;
  return [
    {
      value: "everyone" as const,
      label: `${mine ? sibling : organizer} and me`,
      detail: "You both get the alert. Whoever answers first decides.",
    },
    {
      value: "organizer" as const,
      label: mine ? "Just me" : `Just ${organizer}`,
      detail: mine ? `Only you are asked. ${sibling} still sees every decision.` : `Only ${organizer} is asked. You still see every decision.`,
    },
  ];
}

/**
 * The wording that always sends a payment to family, whatever the amount: the risk engine's groups (src/lib/risk.ts),
 * each with a phrase it listens for. The same chips Sarah and Tom see on a held payment. A test checks every one fires.
 */
export const ALWAYS_WORDS: readonly { chip: string; example: string }[] = [
  { chip: "Tech-support story", example: "my computer was hacked" },
  { chip: "Gift cards", example: "pay with gift cards" },
  { chip: "Crypto or wire", example: "a wire transfer" },
  { chip: "Government threat", example: "the IRS says I owe" },
  { chip: "Family emergency", example: "my grandson needs bail" },
  { chip: "Asked to keep it secret", example: "don't tell anyone" },
  { chip: "Urgent wording", example: "pay right now" },
];
