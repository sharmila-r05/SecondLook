import { deviceLock } from "@/lib/device-lock";
import { resetFamily } from "@/lib/family";
import { seeOther } from "@/lib/redirect";
import { getSessionId } from "@/lib/session";
import { screenOf } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

/** Reset (brief §4): clears this visitor's session only, seeds a fresh family, and returns to the same screen. */
export async function POST(request: Request) {
  // Mom's tablet and Rosa's phone in a family someone set up have no Reset (lib/device-lock).
  const locked = await deviceLock();
  if (locked) return seeOther(screenOf(locked));
  await resetFamily(await getSessionId());

  // Only the referer's path is kept, so the redirect stays on this site whatever host the proxy reports.
  let back = "/parent";
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      back = url.pathname + url.search;
    } catch {
      // keep /parent
    }
  }
  return seeOther(back);
}
