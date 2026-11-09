// Where a device belongs. An invited device (Margaret's tablet, the sibling's or Rosa's phone) opens its person's
// screen; the organizer goes to the setup until it's done, then to their own screen.

import type { Account } from "@/lib/auth";
import { findFamily } from "@/lib/family";
import { type Person, screenOf } from "@/lib/session-cookie";

export async function homeFor(sessionId: string, person: Person | null, account: Account | null): Promise<string | null> {
  const family = await findFamily(sessionId);
  if (!family || family.settings.origin !== "setup") return null;
  const organizer = family.members.find((m) => m.id === family.settings.organizerId)?.name;
  const me = person ?? account?.person ?? null;
  if (!family.settings.setupCompletedAt && (me === null || me === organizer)) return "/setup";
  return me ? screenOf(me) : null;
}
