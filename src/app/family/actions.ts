"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { type BillRequest, captureAndPay, loadRequest, moveRequest, releaseHold } from "@/lib/bills";
import { closeWeek } from "@/lib/care";
import { decidedMessage } from "@/lib/copy/push";
import { db } from "@/lib/db";
import { keepDeviceTo } from "@/lib/device-lock";
import { recordEvent } from "@/lib/events";
import { ensureFamily } from "@/lib/family";
import { PayPalError } from "@/lib/paypal";
import { notifyChildren } from "@/lib/push";
import { getSessionId } from "@/lib/session";

/**
 * Sarah or Tom decides a held payment. First responder wins, exactly once: the move out of "held" is one conditional
 * update, and only the request that made it goes on to PayPal. Approve captures and pays; deny voids the hold.
 */
export async function decide(formData: FormData): Promise<void> {
  const requestId = String(formData.get("request") ?? "");
  const decision = formData.get("decision");
  const asTom = formData.get("as") === "tom";
  const back = asTom ? "/family?as=tom" : "/family";
  if (!/^[0-9a-f-]{36}$/i.test(requestId) || (decision !== "approve" && decision !== "deny")) redirect(back);

  const sessionId = await getSessionId();
  const family = await ensureFamily(sessionId);
  await keepDeviceTo([], family);
  const member = family.members.find((m) => m.role === "child" && m.name === (asTom ? "Tom" : "Sarah"));
  if (!member) redirect(back);

  const sql = db();
  // The other sibling's waiting alert is replaced by who answered, after the response (never in the money path).
  const tellTheOther = (bill: BillRequest) =>
    after(() => notifyChildren(family, sessionId, decidedMessage(bill, member.name, decision), { except: member.id }));
  try {
    if (decision === "approve") {
      if (await moveRequest(sql, family, requestId, "held", "approved_by_family", { decidedBy: member.id })) {
        await recordEvent(sql, family, sessionId, "request:approved", { requestId, by: member.name });
        const bill = await loadRequest(sql, family, requestId);
        tellTheOther(bill);
        await captureAndPay(family, sessionId, bill);
      }
    } else if (await moveRequest(sql, family, requestId, "held", "denied", { decidedBy: member.id })) {
      await recordEvent(sql, family, sessionId, "request:denied", { requestId, by: member.name });
      const bill = await loadRequest(sql, family, requestId);
      tellTheOther(bill);
      await releaseHold(family, sessionId, bill);
    }
  } catch (err) {
    // The decision is saved; the PayPal step is retried on the next look. Log PayPal's debug_id, never bodies.
    console.error("carrying out a family decision failed:", err instanceof PayPalError ? `${err.issue} (debug_id ${err.debugId})` : err);
  }
  redirect(back);
}

/** Sarah or Tom closes the care week: Rosa is paid by PayPal now, and each of them gets an invoice for their share. */
export async function closeCareWeek(formData: FormData): Promise<void> {
  const asTom = formData.get("as") === "tom";
  const back = asTom ? "/family?as=tom&tab=care" : "/family?tab=care";
  const sessionId = await getSessionId();
  const family = await ensureFamily(sessionId);
  await keepDeviceTo([], family);
  const member = family.members.find((m) => m.role === "child" && m.name === (asTom ? "Tom" : "Sarah"));
  if (!member) redirect(back);
  try {
    await closeWeek(family, sessionId, member.id);
  } catch (err) {
    // The period and its PayPal keys are saved; the next look finishes the PayPal steps.
    console.error("closing the care week failed:", err instanceof PayPalError ? `${err.issue} (debug_id ${err.debugId})` : err);
  }
  redirect(back);
}
