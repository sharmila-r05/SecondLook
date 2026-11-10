import { getAccount } from "@/lib/account";
import { findFamily } from "@/lib/family";
import { appStartIn } from "@/lib/home";
import { seeOther } from "@/lib/redirect";
import { getDevicePerson, getSessionId } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The installed app's front door (the manifest's start_url): sends this device to its own person's screen. It reads
 * which family the device is in now and never switches it, so a device looking at the ready-made family stays there.
 */
export async function GET() {
  const [sessionId, person, account] = await Promise.all([getSessionId(), getDevicePerson(), getAccount()]);
  const family = await findFamily(sessionId);
  return seeOther(appStartIn(family, person, account?.sessionId === sessionId ? account : null));
}
