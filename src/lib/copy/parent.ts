// Everything Margaret's screen says about a payment or a visit, in one place. Hard rule 2: she is never shamed.
// No "scam", "fraud", "hold", "authorization", "risk" or warnings; a payment sent for a second look says just that.

import type { MarkState } from "@/components/quilt/StateMark";
import type { StitchKind } from "@/components/quilt/Stitch";
import { formatUsd } from "@/lib/money";
import { holdWords } from "@/lib/settings";
import { formatTime } from "@/lib/time";

export type BillState = "processing" | "paid" | "waiting" | "approved" | "declined" | "expired";

export type ParentEntry =
  | {
      kind: "bill";
      id: string;
      state: BillState;
      payee: string;
      amountCents: number;
      at: Date;
      /** Who it was sent to while waiting, or who decided once decided. */
      familyMember: string;
    }
  | { kind: "visit"; id: string; aide: string; at: Date };

export interface ParentLine {
  id: string;
  mark: MarkState;
  stitch: StitchKind;
  fabric: string;
  title: string;
  /** Bills only: the amount, ranked with the title on its own line. */
  amount?: string;
  detail: string;
}

const MARGARET = "var(--margaret)";
const ROSA = "var(--rosa)";

export function parentLine(entry: ParentEntry): ParentLine {
  const time = formatTime(entry.at);
  if (entry.kind === "visit") {
    return { id: entry.id, mark: "settled", stitch: "sewn", fabric: ROSA, title: `${entry.aide} came today`, detail: time };
  }

  const amount = formatUsd(entry.amountCents);
  const base = { id: entry.id, fabric: MARGARET };
  switch (entry.state) {
    case "processing":
      return { ...base, mark: "processing", stitch: "sewn", title: `Paying ${entry.payee}`, amount, detail: time };
    case "paid":
      return { ...base, mark: "settled", stitch: "sewn", title: `Paid ${entry.payee}`, amount, detail: time };
    case "waiting":
      return {
        ...base,
        mark: "waiting",
        stitch: "basting",
        title: `Sent to ${entry.familyMember} to double-check`,
        amount,
        detail: `to ${entry.payee} · ${time}`,
      };
    case "approved":
      return {
        ...base,
        mark: "settled",
        stitch: "sewn",
        title: `${entry.familyMember} approved it, paid`,
        amount,
        detail: `to ${entry.payee} · ${time}`,
      };
    case "declined":
      return {
        ...base,
        mark: "declined",
        stitch: "pulled",
        title: `${entry.familyMember} said no, nothing was paid`,
        amount,
        detail: `to ${entry.payee}`,
      };
    case "expired":
      return {
        ...base,
        mark: "declined",
        stitch: "pulled",
        title: "Nothing was paid",
        amount,
        detail: `to ${entry.payee} · no one could check it in time`,
      };
  }
}

/** Waiting entries first (they're what's new for her), then newest first. */
export function orderForParent(entries: readonly ParentEntry[]): ParentEntry[] {
  const waiting = (e: ParentEntry) => (e.kind === "bill" && e.state === "waiting" ? 0 : 1);
  return [...entries].sort((a, b) => waiting(a) - waiting(b) || b.at.getTime() - a.at.getTime());
}

/**
 * "Connect PayPal once" on Margaret's screen, and what she is told after. Plain words: no "vault", "token" or
 * "agreement". It says what she agrees to (only bills she says yes to are paid) before PayPal asks her.
 */
export const CONNECT_COPY = {
  heading: "Connect your PayPal once",
  body: "PayPal asks you one time. After that, “Yes, pay it” is all it takes. Only bills you say yes to are paid.",
  button: "Connect PayPal",
  pending: "One moment…",
  connected: "Your PayPal is connected. Now “Yes, pay it” is all it takes.",
  notConnected: "Your PayPal isn’t connected, so nothing changed. You can connect it any time.",
} as const;

export interface AgreementCopy {
  heading: string;
  /** What Second Look does, one plain sentence each: her bills, the second look, the wait. */
  lines: { key: "bills" | "family" | "wait"; text: string }[];
  button: string;
  pending: string;
}

/**
 * The first thing Margaret's screen shows in a family just set up: who set it up with her, what it does, and one yes.
 * It names who takes the second look (both children, or just the one who set it up) and how long a payment waits.
 */
export function agreementCopy(input: { organizer: string; sibling: string | null; ask: "everyone" | "organizer"; holdMinutes: number }): AgreementCopy {
  const both = input.ask === "everyone" && input.sibling !== null;
  const wait = holdWords(input.holdMinutes);
  return {
    heading: `${input.organizer} set up Second Look with you`,
    lines: [
      { key: "bills", text: "Your bills are still yours to pay." },
      {
        key: "family",
        text: `When a payment looks unusual, ${both ? `${input.organizer} or ${input.sibling}` : input.organizer} takes a second look before any money moves.`,
      },
      {
        key: "wait",
        text: both ? `If no one answers within ${wait}, nothing is paid.` : `If ${input.organizer} doesn’t answer within ${wait}, nothing is paid.`,
      },
    ],
    button: "That sounds good",
    pending: "One moment…",
  };
}
