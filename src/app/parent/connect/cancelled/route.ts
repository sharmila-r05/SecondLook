import { NextResponse } from "next/server";
import { ensureFamily } from "@/lib/family";
import { getSessionId } from "@/lib/session";
import { cancelConnect } from "@/lib/vault";

export const dynamic = "force-dynamic";

/** Margaret backed out on PayPal's page: nothing was saved, and the bills keep asking PayPal each time. */
export async function GET(request: Request) {
  await cancelConnect(await ensureFamily(await getSessionId()));
  return NextResponse.redirect(new URL("/parent?paypal=not-connected", request.url), 303);
}
