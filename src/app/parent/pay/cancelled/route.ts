import { NextResponse } from "next/server";
import { abandonBill } from "@/lib/bills";
import { ensureFamily } from "@/lib/family";
import { getSessionId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Margaret backed out on PayPal's page: nothing was authorized, so nothing is kept. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestId = url.searchParams.get("request");
  if (requestId && /^[0-9a-f-]{36}$/i.test(requestId)) {
    await abandonBill(await ensureFamily(await getSessionId()), requestId);
  }
  return NextResponse.redirect(new URL("/parent", url), 303);
}
