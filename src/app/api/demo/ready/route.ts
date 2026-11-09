import { cookies } from "next/headers";
import { findFamily } from "@/lib/family";
import { seeOther } from "@/lib/redirect";
import { getSessionId } from "@/lib/session";
import { DEVICE_COOKIE, SESSION_COOKIE } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

/**
 * "See a family already set up": Margaret's screen in the ready-made Hale family. A device that was in a family
 * someone set up gets a fresh demo session for it; signing in again (or "Go to your family") comes back.
 */
export async function POST() {
  const family = await findFamily(await getSessionId());
  if (family?.settings.origin === "setup") {
    const jar = await cookies();
    jar.delete(SESSION_COOKIE);
    jar.delete(DEVICE_COOKIE);
  }
  return seeOther("/parent");
}
