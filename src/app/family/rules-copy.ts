// What the family's Rules tab says: each choice in words, the wording that always sends a payment to family, and where
// each person in the family is. Family copy may name a scam pattern plainly; it never blames Mom.

import { formatUsd } from "@/lib/money";
import { holdWords } from "@/lib/settings";

/** "$300" for whole dollars, "$23.40" otherwise: how a limit reads in a choice. */
export function dollars(cents: number): string {
  const full = formatUsd(cents);
  return cents % 100 === 0 ? full.slice(0, -3) : full;
}

/** A typed amount's starting text: "84.00" (no "$": the field shows its own). */
export function amountText(cents: number): string {
  return formatUsd(cents).slice(1).replace(/,/g, "");
}

/** As the chip on a held payment says it: "3× the usual". */
export const timesWords = (n: number) => `${n}× the usual`;

/** How long a payment waits for family, as a choice: "10 minutes", "1 hour", "1 day". */
export const waitWords = (minutes: number) => holdWords(minutes).replace(/^an? /, "1 ");

/**
 * Why a save was refused, as the family reads it: the server names what was wrong; an amount out of range also says
 * what range it must be in, and the apostrophes are typeset.
 */
export function refusal(error: string, range?: { minCents: number; maxCents: number }): string {
  const ranged = range ? error.replace(/ isn['’]t an amount in range\.?$/, ` should be from ${dollars(range.minCents)} to ${dollars(range.maxCents)}`) : error;
  const typeset = ranged.replace(/'/g, "’");
  return /[.!?]$/.test(typeset) ? typeset : `${typeset}.`;
}

/** Sarah's share of care costs as a choice; Tom has the rest. */
export function shareWords(sarahShare: number): string {
  if (sarahShare === 50) return "Half each";
  if (sarahShare === 100) return "Sarah pays it all";
  if (sarahShare === 0) return "Tom pays it all";
  return `Sarah ${sarahShare}%, Tom ${100 - sarahShare}%`;
}

/**
 * The wording that always sends a payment to family, whatever the amount: the risk engine's groups (src/lib/risk.ts),
 * each with a phrase it listens for. A test checks every one still fires.
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

export type Viewer = "Sarah" | "Tom";

export interface PersonInput {
  id: string;
  name: string;
  role: "parent" | "child" | "aide";
  joinedAt: Date | null;
}

export interface PersonRow {
  id: string;
  name: string;
  /** Who they are to the person looking: "Mom", "You", "Your brother", "Mom’s aide". */
  relation: string;
  status: string;
  /** In and ready: the row's mark is filled in their fabric; otherwise it's an open, dashed ring. */
  done: boolean;
  fabric: string;
}

const FABRIC: Record<string, string> = {
  Margaret: "var(--margaret)",
  Sarah: "var(--sarah)",
  Tom: "var(--tom)",
  Rosa: "var(--rosa)",
};

function relationTo(viewer: Viewer, person: PersonInput): string {
  if (person.role === "parent") return "Mom";
  if (person.role === "aide") return "Mom’s aide";
  if (person.name === viewer) return "You";
  return person.name === "Tom" ? "Your brother" : "Your sister";
}

/**
 * The family, Mom first, then whoever set it up, the other sibling and Rosa. A family someone set up shows who has
 * opened their invite; the ready-made family's people are all in already.
 */
export function peopleRows(input: {
  members: readonly PersonInput[];
  organizerId: string | null;
  origin: "ready" | "setup";
  viewer: Viewer;
  parentAgreed: boolean;
  paypalConnected: boolean;
}): PersonRow[] {
  const { members, organizerId, origin, viewer, parentAgreed, paypalConnected } = input;
  const rank = (m: PersonInput) => (m.role === "parent" ? 0 : m.id === organizerId ? 1 : m.role === "child" ? 2 : 3);
  return [...members]
    .sort((a, b) => rank(a) - rank(b))
    .map((m) => {
      const base = { id: m.id, name: m.name, relation: relationTo(viewer, m), fabric: FABRIC[m.name] ?? "var(--ink-muted)" };
      if (m.role === "parent") {
        if (parentAgreed) {
          return paypalConnected
            ? { ...base, status: "Said yes · PayPal connected", done: true }
            : { ...base, status: "Said yes · PayPal not connected yet", done: false };
        }
        return { ...base, status: m.joinedAt ? "Opened her invite, hasn’t said yes yet" : "Hasn’t opened her invite yet", done: false };
      }
      if (m.id === organizerId) return { ...base, status: "Set up the family", done: true };
      if (origin === "ready" || m.joinedAt) return { ...base, status: "Joined", done: true };
      return { ...base, status: "Hasn’t opened the invite yet", done: false };
    });
}
