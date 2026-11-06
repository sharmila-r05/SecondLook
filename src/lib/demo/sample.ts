// The demo family's day, as Margaret sees it, until the screens read from the database. Every person and business is
// fictional (hard rule 8). Times are set on today's date in Ohio; November is Eastern Standard Time (UTC-5).

import type { ParentEntry } from "@/lib/copy/parent";
import { localDate } from "@/lib/time";

export function sampleParentDay(now = new Date()): ParentEntry[] {
  const day = localDate(now);
  const at = (hhmm: string) => new Date(`${day}T${hhmm}:00-05:00`);
  return [
    { kind: "visit", id: "visit-today", aide: "Rosa", at: at("08:30") },
    { kind: "bill", id: "bill-electric", state: "paid", payee: "Hollowbrook Electric", amountCents: 8400, at: at("09:12"), familyMember: "Sarah" },
    { kind: "bill", id: "bill-support", state: "waiting", payee: "Tech Support Line", amountCents: 150000, at: at("10:41"), familyMember: "Sarah" },
  ];
}
