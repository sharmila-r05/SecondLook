import { ensureFamily } from "@/lib/family";
import { PayPalError } from "@/lib/paypal";
import { getSessionId } from "@/lib/session";
import { finishConnect } from "@/lib/vault";
import { seeOther } from "@/lib/redirect";

export const dynamic = "force-dynamic";

/** PayPal sends Margaret back here once she approved Second Look: save her PayPal for the bills she says yes to. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  // PayPal names the approved setup token on the return; finishConnect only ever uses one this session started.
  const named = ["approval_session_id", "approval_token_id"]
    .map((key) => url.searchParams.get(key) ?? "")
    .filter((id) => /^[A-Z0-9]{1,64}$/i.test(id));

  const sessionId = await getSessionId();
  const family = await ensureFamily(sessionId);
  try {
    await finishConnect(family, sessionId, named);
    return seeOther("/parent?paypal=connected");
  } catch (err) {
    // Log PayPal's debug_id, never bodies or emails.
    console.error("connecting PayPal failed:", err instanceof PayPalError ? `${err.issue} (debug_id ${err.debugId})` : err);
    return seeOther("/parent?paypal=not-connected");
  }
}
