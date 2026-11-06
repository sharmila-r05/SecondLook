import { NextResponse } from "next/server";
import { resetFamily } from "@/lib/family";
import { getSessionId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Reset (brief §4): clears this visitor's session only, seeds a fresh family, and returns to the same screen. */
export async function POST(request: Request) {
  await resetFamily(await getSessionId());

  const fallback = new URL("/parent", request.url);
  const referer = request.headers.get("referer");
  let back = fallback;
  if (referer) {
    const url = new URL(referer);
    if (url.origin === fallback.origin) back = new URL(url.pathname + url.search, request.url);
  }
  return NextResponse.redirect(back, 303);
}
