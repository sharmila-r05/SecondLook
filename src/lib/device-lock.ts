// Mom's tablet and Rosa's phone in a family someone set up are theirs alone (hard rules 1 and 2): the bar has no
// person tabs and no Reset, and the family's screens and actions send them back to their own. Who is kept is decided
// in lib/home (lockedPersonIn); this reads it from the device's cookies.

import { redirect } from "next/navigation";
import { getAccount } from "@/lib/account";
import { type Family, findFamily } from "@/lib/family";
import { type LockedPerson, lockedPersonIn } from "@/lib/home";
import { getDevicePerson, getSessionId } from "@/lib/session";
import { screenOf } from "@/lib/session-cookie";

/** Who this device is kept to, if anyone. Only a device remembered as Margaret or Rosa costs a read. */
export async function deviceLock(family?: Family | null): Promise<LockedPerson | null> {
  const person = await getDevicePerson();
  if (person !== "Margaret" && person !== "Rosa") return null;
  const sessionId = await getSessionId();
  const [account, current] = await Promise.all([getAccount(), family === undefined ? findFamily(sessionId) : Promise.resolve(family)]);
  return lockedPersonIn(current, person, account?.sessionId === sessionId ? account : null);
}

/**
 * For a page or an action: a device kept to someone not in `allowed` goes back to its own screen. Returns whether the
 * device is kept to one person, so the bar leaves out the tabs and Reset.
 */
export async function keepDeviceTo(allowed: readonly LockedPerson[], family?: Family | null): Promise<boolean> {
  const locked = await deviceLock(family);
  if (locked && !allowed.includes(locked)) redirect(screenOf(locked));
  return locked !== null;
}
