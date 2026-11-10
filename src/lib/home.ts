// Where a device belongs. An invited device (Margaret's tablet, the sibling's or Rosa's phone) opens its person's
// screen; the organizer goes to the setup until it's done, then to their own screen.

import type { Account } from "@/lib/auth";
import { type Family, findFamily } from "@/lib/family";
import { type Person, screenOf } from "@/lib/session-cookie";

/** The same, for a family already loaded. Null for the ready-made family, or a device nobody was invited on. */
export function homeIn(family: Family | null, person: Person | null, account: Account | null): string | null {
  if (!family || family.settings.origin !== "setup") return null;
  const organizer = family.members.find((m) => m.id === family.settings.organizerId)?.name;
  const me = person ?? account?.person ?? null;
  if (!family.settings.setupCompletedAt && (me === null || me === organizer)) return "/setup";
  return me ? screenOf(me) : null;
}

export async function homeFor(sessionId: string, person: Person | null, account: Account | null): Promise<string | null> {
  return homeIn(await findFamily(sessionId), person, account);
}

/**
 * Where the app on a home screen opens (the manifest's start_url goes through /open). In a family someone set up,
 * each device opens its own person's screen, so Mom's tablet never opens on Sarah's. The ready-made family opens the
 * family screen, where its alerts are, as it always has; a device nobody was invited on gets the welcome page.
 */
export function appStartIn(family: Family | null, person: Person | null, account: Account | null): string {
  if (!family || family.settings.origin !== "setup") return "/family";
  return homeIn(family, person, account) ?? "/";
}
