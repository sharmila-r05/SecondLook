import { resetFamily } from "@/lib/family";
import { seeOther } from "@/lib/redirect";
import { getSessionId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Reset (brief §4): clears this visitor's session only, seeds a fresh family, and returns to the same screen. */
export async function POST(request: Request) {
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
