import { ensureFamily } from "@/lib/family";
import { PayPalError } from "@/lib/paypal";
import { seeOther } from "@/lib/redirect";
import { getSessionId } from "@/lib/session";
import { settleApprovedOrder } from "../settle";

export const dynamic = "force-dynamic";

/** PayPal sends Margaret back here once she approved (?token=<order id>): place the hold, then apply the decision. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("token");
  if (!orderId) return seeOther("/parent");

  const sessionId = await getSessionId();
  const family = await ensureFamily(sessionId);
  try {
    await settleApprovedOrder(family, sessionId, orderId);
    return seeOther("/parent");
  } catch (err) {
    // Log PayPal's debug_id, never bodies or emails.
    console.error("finishing a bill failed:", err instanceof PayPalError ? `${err.issue} (debug_id ${err.debugId})` : err);
    return seeOther("/parent?paypal=problem");
  }
}
