// Everything Margaret's screen says about a payment or a visit, in one place. Hard rule 2: she is never shamed.
// No "scam", "fraud", "hold", "authorization", "risk" or warnings; a payment sent for a second look says just that.

import type { MarkState } from "@/components/quilt/StateMark";
import type { StitchKind } from "@/components/quilt/Stitch";
import { formatUsd } from "@/lib/money";
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
      return { ...base, mark: "processing", stitch: "sewn", title: `Paying ${entry.payee}`, detail: `${amount} · ${time}` };
    case "paid":
      return { ...base, mark: "settled", stitch: "sewn", title: `Paid ${entry.payee}`, detail: `${amount} · ${time}` };
    case "waiting":
      return {
        ...base,
        mark: "waiting",
        stitch: "basting",
        title: `Sent to ${entry.familyMember} to double-check`,
        detail: `${amount} to ${entry.payee} · ${time}`,
      };
    case "approved":
      return {
        ...base,
        mark: "settled",
        stitch: "sewn",
        title: `${entry.familyMember} approved it, paid`,
        detail: `${amount} to ${entry.payee} · ${time}`,
      };
    case "declined":
      return {
        ...base,
        mark: "declined",
        stitch: "pulled",
        title: `${entry.familyMember} said no, nothing was paid`,
        detail: `${amount} to ${entry.payee}`,
      };
    case "expired":
      return {
        ...base,
        mark: "declined",
        stitch: "pulled",
        title: "Nothing was paid",
        detail: `${amount} to ${entry.payee} · no one could check it in time`,
      };
  }
}

/** Waiting entries first (they're what's new for her), then newest first. */
export function orderForParent(entries: readonly ParentEntry[]): ParentEntry[] {
  const waiting = (e: ParentEntry) => (e.kind === "bill" && e.state === "waiting" ? 0 : 1);
  return [...entries].sort((a, b) => waiting(a) - waiting(b) || b.at.getTime() - a.at.getTime());
}
