// The demo family every visitor starts with. Every person and business is fictional (hard rule 8). The seed holds
// no money moves: anything in the ledger happened for real, in the PayPal sandbox, during this session.

import type postgres from "postgres";
import { DEFAULT_HOLD_MINUTES } from "@/lib/settings";
import { addDays, localDate } from "@/lib/time";
import { SANDBOX_EMAILS } from "./accounts";
import { PAYEE_CATALOG } from "./payees";

/** Rosa is paid $50.00 a visit unless the family sets another rate. */
export const VISIT_RATE_CENTS = 5000;
/** Margaret's per-payment limit: anything over $300.00 goes to family for a second look, unless the family changes it. */
export const PER_PAYMENT_LIMIT_CENTS = 30000;

const ROSA_EARLIER_VISITS = [-4, -2]; // days before today: her week is never empty, whatever the weekday

/**
 * "ready": the Hale family as a visitor first finds it, set up by Sarah, Margaret agreed and (on the hosted demo)
 * her PayPal connected. "setup": the same people with nothing chosen yet, for the organizer to set up step by step.
 */
export type SeedOptions = { origin: "ready" } | { origin: "setup"; organizer: "Sarah" | "Tom" };

export async function seedFamily(
  tx: postgres.TransactionSql,
  sessionId: string,
  options: SeedOptions = { origin: "ready" },
  now = new Date(),
): Promise<string> {
  const ready = options.origin === "ready";
  const [family] = await tx<{ id: string }[]>`
    insert into families (demo_session_id, name, split_rule, origin, limit_cents, hold_minutes, visit_rate_cents,
                          setup_step, setup_completed_at, parent_agreed_at)
    values (${sessionId}, 'The Hale family', '{}', ${options.origin}, ${PER_PAYMENT_LIMIT_CENTS}, ${DEFAULT_HOLD_MINUTES},
            ${VISIT_RATE_CENTS}, ${ready ? null : "bills"}, ${ready ? now : null}, ${ready ? now : null})
    returning id`;
  if (!family) throw new Error("seeding the family returned no row");
  const base = { demo_session_id: sessionId, family_id: family.id };

  const members = await tx<{ id: string; name: string }[]>`
    insert into members ${tx([
      { ...base, name: "Margaret", role: "parent", paypal_email: SANDBOX_EMAILS.margaret },
      { ...base, name: "Sarah", role: "child", paypal_email: SANDBOX_EMAILS.sarah },
      { ...base, name: "Tom", role: "child", paypal_email: SANDBOX_EMAILS.tom },
      { ...base, name: "Rosa", role: "aide", paypal_email: SANDBOX_EMAILS.rosa },
    ])}
    returning id, name`;
  const memberId = (name: string) => {
    const found = members.find((m) => m.name === name);
    if (!found) throw new Error(`seeded member ${name} is missing`);
    return found.id;
  };

  // Sarah and Tom split Rosa's pay evenly until they choose otherwise; Sarah takes a leftover cent (hard rule 5).
  const organizer = ready ? "Sarah" : options.organizer;
  await tx`
    update families set split_rule = ${tx.json({ [memberId("Sarah")]: 50, [memberId("Tom")]: 50 })},
                        organizer_member_id = ${memberId(organizer)}
    where id = ${family.id}`;

  // A family being set up starts with nothing chosen: Mom's bills, her PayPal and Rosa's visits come from the steps.
  if (!ready) return family.id;

  // The hosted demo's Margaret has already connected her PayPal once (Vault): set DEMO_PARENT_VAULT_ID to that payment
  // token, and every visitor's bills are paid from it with no PayPal login. Unset, she connects it herself.
  const vaultId = process.env.DEMO_PARENT_VAULT_ID;
  if (vaultId) {
    await tx`update members set paypal_vault_id = ${vaultId}, vaulted_at = now() where id = ${memberId("Margaret")} and role = 'parent'`;
  }

  // Known payees carry no limit of their own: the family's limit applies to them.
  await tx`
    insert into payees ${tx(
      PAYEE_CATALOG.map((p) => ({
        ...base,
        name: p.name,
        aliases: p.aliases,
        paypal_email: p.paypalEmail,
        known: true,
        usual_amount_cents: p.usualAmountCents,
      })),
    )}`;

  // Rosa's two earlier visits, so a visitor on any weekday sees a week worth closing. Visits move no money until the
  // week closes. November and December are Eastern Standard Time (UTC-5).
  const today = localDate(now);
  const earlier = ROSA_EARLIER_VISITS.map((offset) => addDays(today, offset));
  for (const date of earlier) {
    await tx`
      insert into visits (demo_session_id, family_id, aide_member_id, visit_date, confirmed_by, rate_cents,
                          checked_in_at, checked_out_at, created_at)
      values (${sessionId}, ${family.id}, ${memberId("Rosa")}, ${date}, 'aide', ${VISIT_RATE_CENTS},
              ${`${date}T08:30:00-05:00`}, ${`${date}T10:30:00-05:00`}, ${`${date}T08:30:00-05:00`})`;
  }

  return family.id;
}
