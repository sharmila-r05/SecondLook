// The demo family every visitor starts with. Every person and business is fictional (hard rule 8). The seed holds
// no money moves: anything in the ledger happened for real, in the PayPal sandbox, during this session.

import type postgres from "postgres";
import { addDays, localDate } from "@/lib/time";
import { SANDBOX_EMAILS } from "./accounts";

/** Rosa is paid $50.00 a visit. */
export const VISIT_RATE_CENTS = 5000;
/** Margaret's per-payment limit: anything over $300.00 goes to family for a second look. */
export const PER_PAYMENT_LIMIT_CENTS = 30000;

const ROSA_EARLIER_VISITS = [-4, -2]; // days before today: her week is never empty, whatever the weekday

export async function seedFamily(tx: postgres.TransactionSql, sessionId: string, now = new Date()): Promise<string> {
  const [family] = await tx<{ id: string }[]>`
    insert into families (demo_session_id, name, split_rule)
    values (${sessionId}, 'The Hale family', '{}')
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

  // Sarah and Tom split Rosa's pay evenly; Sarah takes a leftover cent on a tie (hard rule 5).
  await tx`update families set split_rule = ${tx.json({ [memberId("Sarah")]: 50, [memberId("Tom")]: 50 })} where id = ${family.id}`;

  // The hosted demo's Margaret has already connected her PayPal once (Vault): set DEMO_PARENT_VAULT_ID to that payment
  // token, and every visitor's bills are paid from it with no PayPal login. Unset, she connects it herself.
  const vaultId = process.env.DEMO_PARENT_VAULT_ID;
  if (vaultId) {
    await tx`update members set paypal_vault_id = ${vaultId}, vaulted_at = now() where id = ${memberId("Margaret")} and role = 'parent'`;
  }

  await tx`
    insert into payees ${tx([
      {
        ...base,
        name: "Hollowbrook Electric",
        aliases: ["electric", "electric bill", "electricity", "power", "power bill", "power company", "light bill", "hollowbrook"],
        paypal_email: SANDBOX_EMAILS.electric,
        known: true,
        per_payment_limit_cents: PER_PAYMENT_LIMIT_CENTS,
        usual_amount_cents: 8400,
      },
      {
        ...base,
        name: "Elmwood Pharmacy",
        aliases: ["pharmacy", "drugstore", "prescription", "prescriptions", "medicine", "elmwood"],
        paypal_email: SANDBOX_EMAILS.pharmacy,
        known: true,
        per_payment_limit_cents: PER_PAYMENT_LIMIT_CENTS,
        usual_amount_cents: 2340,
      },
    ])}`;

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
