// What the family's Rules tab says beyond the settings' names (those are shared with the setup steps, in
// src/lib/copy/rules.ts): typed amounts, why a save was refused, and where each person in the family is.

import { dollars } from "@/lib/copy/rules";
import { formatUsd } from "@/lib/money";

/** A typed amount's starting text: "84.00" (no "$": the field shows its own). */
export function amountText(cents: number): string {
  return formatUsd(cents).slice(1).replace(/,/g, "");
}

/**
 * Why a save was refused, as the family reads it: the server names what was wrong; an amount out of range also says
 * what range it must be in, and the apostrophes are typeset.
 */
export function refusal(error: string, range?: { minCents: number; maxCents: number }): string {
  const ranged = range ? error.replace(/ isn['’]t an amount in range\.?$/, ` should be from ${dollars(range.minCents)} to ${dollars(range.maxCents)}`) : error;
  const typeset = ranged.replace(/'/g, "’");
  return /[.!?]$/.test(typeset) ? typeset : `${typeset}.`;
}

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
  /**
   * Mom's three steps, each marked as the invite card marks them (filled in her fabric once done, basted until then),
   * so "said yes, PayPal not connected yet" doesn't look like "hasn't opened it". Shown in place of `status`.
   */
  steps?: { done: boolean; text: string }[];
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
        // She can't say yes without opening Second Look (in the demo, someone may tap her tab for her).
        const opened = origin === "ready" || m.joinedAt !== null || parentAgreed;
        const steps = [
          { done: opened, text: opened ? "Opened her invite" : "Hasn’t opened her invite yet" },
          { done: parentAgreed, text: parentAgreed ? "Said yes to Second Look" : "Hasn’t said yes yet" },
          { done: paypalConnected, text: paypalConnected ? "Her PayPal is connected" : "Her PayPal isn’t connected yet" },
        ];
        if (parentAgreed) {
          return paypalConnected
            ? { ...base, status: "Said yes · PayPal connected", steps, done: true }
            : { ...base, status: "Said yes · PayPal not connected yet", steps, done: false };
        }
        return { ...base, status: m.joinedAt ? "Opened her invite, hasn’t said yes yet" : "Hasn’t opened her invite yet", steps, done: false };
      }
      if (m.id === organizerId) return { ...base, status: "Set up the family", done: true };
      if (origin === "ready" || m.joinedAt) return { ...base, status: "Joined", done: true };
      return { ...base, status: "Hasn’t opened the invite yet", done: false };
    });
}
