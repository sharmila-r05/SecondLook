import { after } from "next/server";
import { improveHeldNote } from "@/lib/ai-note";
import { finishApproval } from "@/lib/bills";
import { holdMessage } from "@/lib/copy/push";
import { ensureFamily } from "@/lib/family";
import { templateNote } from "@/lib/note";
import { PayPalError } from "@/lib/paypal";
import { notifyChildren } from "@/lib/push";
import { seeOther } from "@/lib/redirect";
import { getSessionId } from "@/lib/session";

export const dynamic = "force-dynamic";

const HOLD_MINUTES = Number(process.env.HOLD_TIMEOUT_MINUTES ?? 10) || 10;

/** PayPal sends Margaret back here once she approved (?token=<order id>): place the hold, then apply the decision. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("token");
  if (!orderId) return seeOther("/parent");

  const sessionId = await getSessionId();
  const family = await ensureFamily(sessionId);
  try {
    const bill = await finishApproval(family, sessionId, orderId, HOLD_MINUTES, async (held) => templateNote(held));
    if (bill.status === "held") {
      // Sarah's and Tom's phones buzz once Margaret has her answer; push never holds up a money step.
      after(() => notifyChildren(family, sessionId, holdMessage(bill, HOLD_MINUTES)));
      // The template note is already saved; Claude's replaces it after Margaret has her answer.
      after(() => improveHeldNote(family, sessionId, bill.id));
    }
    return seeOther("/parent");
  } catch (err) {
    // Log PayPal's debug_id, never bodies or emails.
    console.error("finishing a bill failed:", err instanceof PayPalError ? `${err.issue} (debug_id ${err.debugId})` : err);
    return seeOther("/parent?paypal=problem");
  }
}
