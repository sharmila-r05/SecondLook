"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { startBill } from "@/lib/bills";
import { db } from "@/lib/db";
import { recordEvent } from "@/lib/events";
import { ensureFamily, memberNamed } from "@/lib/family";
import { assertCents, formatUsd } from "@/lib/money";
import { matchPayee, parseRequest } from "@/lib/parse";
import { PayPalError } from "@/lib/paypal";
import { evaluate } from "@/lib/risk";
import { riskPolicy } from "@/lib/settings";
import { getSessionId } from "@/lib/session";
import { localDate, PARENT_TIME_ZONE } from "@/lib/time";
import { publicOrigin } from "@/lib/redirect";
import { settleHeldBill } from "./settle";

/** Anything above this is surely a mishearing; she's asked to say it again. */
const MAX_REQUEST_CENTS = 1_000_000;

export type ReadBack =
  | { ok: true; said: string; payeeId: string | null; payeeName: string; amountCents: number; amountLabel: string }
  | { ok: false; message: string; goTo?: string };

function titleCase(text: string): string {
  return text.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Reads back what Margaret asked for, before anything happens. Nothing is saved here. */
export async function hearRequest(text: string): Promise<ReadBack> {
  const said = text.trim().slice(0, 300);
  if (!said) return { ok: false, message: "I didn't hear anything. Tap the microphone and try again, or type it below." };

  const family = await ensureFamily(await getSessionId());
  if (!family.settings.parentAgreedAt) return { ok: false, message: "", goTo: "/parent" };
  const parsed = parseRequest(said, memberNamed(family, "aide"));
  if (parsed?.kind === "visit") return { ok: false, message: "", goTo: "/parent/visit" };
  if (!parsed) {
    return { ok: false, message: "Sorry, I didn't catch who and how much. Try saying “Pay the electric bill, $84.”" };
  }
  if (parsed.amountCents <= 0 || parsed.amountCents > MAX_REQUEST_CENTS) {
    return { ok: false, message: "Sorry, I didn't catch the amount. Could you say it again?" };
  }

  const payees = await db()<{ id: string; name: string; aliases: string[] }[]>`
    select id, name, aliases from payees where family_id = ${family.id} and known order by name`;
  const payee = matchPayee(parsed.payeeText, payees);
  return {
    ok: true,
    said,
    payeeId: payee?.id ?? null,
    payeeName: payee?.name ?? titleCase(parsed.payeeText),
    amountCents: parsed.amountCents,
    amountLabel: formatUsd(parsed.amountCents),
  };
}

/**
 * "Yes, pay it": saves the request with the rules' decision and creates the PayPal order. With her PayPal connected
 * once, the order is paid from it and the decision takes effect right here; otherwise she approves the order on
 * PayPal and the decision takes effect when PayPal sends her back (see /parent/pay/return).
 */
export async function confirmRequest(input: { said: string; payeeId: string | null; payeeName: string; amountCents: number }): Promise<void> {
  const sessionId = await getSessionId();
  const family = await ensureFamily(sessionId);
  if (!family.settings.parentAgreedAt) redirect("/parent");
  assertCents(input.amountCents);
  if (input.amountCents <= 0 || input.amountCents > MAX_REQUEST_CENTS) throw new RangeError("amount out of range");
  const payeeName = input.payeeName.trim().slice(0, 80);
  if (!payeeName) throw new Error("no payee");

  const requestId = await db().begin(async (tx) => {
    let payee: { id: string; name: string; known: boolean; per_payment_limit_cents: string | null; usual_amount_cents: string | null } | undefined;
    if (input.payeeId) {
      [payee] = await tx`
        select id, name, known, per_payment_limit_cents, usual_amount_cents from payees
        where id = ${input.payeeId} and family_id = ${family.id}`;
      if (!payee) throw new Error("that payee isn't in this family");
    } else {
      [payee] = await tx`
        insert into payees (demo_session_id, family_id, name, known)
        values (${sessionId}, ${family.id}, ${payeeName}, false)
        returning id, name, known, per_payment_limit_cents, usual_amount_cents`;
    }
    if (!payee) throw new Error("payee missing");

    const [today] = await tx<{ total: string | null }[]>`
      select sum(amount_cents) as total from payment_requests
      where family_id = ${family.id}
        and (created_at at time zone ${PARENT_TIME_ZONE})::date = ${localDate(new Date())}::date
        and status not in ('denied', 'expired', 'voided')`;

    const risk = evaluate({
      amountCents: input.amountCents,
      text: input.said,
      payee: payee.known
        ? {
            name: payee.name,
            known: true,
            perPaymentLimitCents: payee.per_payment_limit_cents === null ? null : Number(payee.per_payment_limit_cents),
            usualAmountCents: payee.usual_amount_cents === null ? null : Number(payee.usual_amount_cents),
          }
        : null,
      payeeAsHeard: payeeName,
      todaysTotalCents: Number(today?.total ?? 0),
    }, riskPolicy(family.settings));

    // Status stays "new" until PayPal has authorized the payment; only then is it auto-approved or held.
    const [request] = await tx<{ id: string }[]>`
      insert into payment_requests (demo_session_id, family_id, payee_id, amount_cents, request_text, status, triggered_rules)
      values (${sessionId}, ${family.id}, ${payee.id}, ${input.amountCents}, ${input.said}, 'new', ${tx.json(risk.rules.map((r) => ({ ...r })))})
      returning id`;
    if (!request) throw new Error("request insert returned nothing");
    await recordEvent(tx, family, sessionId, "request:created", {
      requestId: request.id,
      payee: payee.name,
      amountCents: input.amountCents,
      secondLook: risk.hold,
    });
    return request.id;
  });

  const h = await headers();
  const origin = publicOrigin(h);
  const started = await startBill(family, sessionId, requestId, origin);
  if (started.kind === "paypal") redirect(started.approveUrl);

  // Her saved PayPal placed the hold with no PayPal page: decide now, and she lands back on today's list.
  let landing = "/parent";
  try {
    await settleHeldBill(family, sessionId, started.requestId);
  } catch (err) {
    // Log PayPal's debug_id, never bodies or emails. A capture that didn't finish is retried on the next look.
    console.error("finishing a bill failed:", err instanceof PayPalError ? `${err.issue} (debug_id ${err.debugId})` : err);
    landing = "/parent?paypal=problem";
  }
  redirect(landing);
}
