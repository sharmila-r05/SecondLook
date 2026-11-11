// What both ways of paying share once the hold is placed: back from PayPal's page (return/route.ts), or straight
// from her saved PayPal ("Yes, pay it" in actions.ts). The rules' decision, the template note on a held payment,
// the family's alert, and Claude's note after Margaret already has her answer.

import { after } from "next/server";
import { improveHeldNote } from "@/lib/ai-note";
import { type BillRequest, finishApproval, settleBill } from "@/lib/bills";
import { holdMessage } from "@/lib/copy/push";
import type { Family } from "@/lib/family";
import { templateNote } from "@/lib/note";
import { notifyChildren } from "@/lib/push";

const firstNote = async (held: BillRequest) => templateNote(held);

function improveLater(family: Family, sessionId: string, bill: BillRequest): BillRequest {
  if (bill.status === "held") {
    // Sarah's and Tom's phones buzz once Margaret has her answer; push never holds up a money step.
    after(() => notifyChildren(family, sessionId, holdMessage(bill, family.settings.holdMinutes)));
    // The template note is already saved; Claude's replaces it after the response.
    after(() => improveHeldNote(family, sessionId, bill.id));
  }
  return bill;
}

/** Back from PayPal's page with an approved order: place the hold, then decide. */
export async function settleApprovedOrder(family: Family, sessionId: string, orderId: string): Promise<BillRequest> {
  return improveLater(family, sessionId, await finishApproval(family, sessionId, orderId, family.settings.holdMinutes, firstNote));
}

/** The payee is paid after the response; a payout that fails here is finished by the next look's sweep. */
const payAfterResponse = (task: () => Promise<void>) =>
  after(() => task().catch((err) => console.error("paying the payee after the response failed; the next look retries:", err)));

/** Her saved PayPal already placed the hold: decide. A normal bill is captured now and paid out after the response. */
export async function settleHeldBill(family: Family, sessionId: string, requestId: string): Promise<BillRequest> {
  return improveLater(family, sessionId, await settleBill(family, sessionId, requestId, family.settings.holdMinutes, firstNote, payAfterResponse));
}
