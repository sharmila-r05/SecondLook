// "Connect PayPal once": Margaret approves Second Look on PayPal one time, and from then on "Yes, pay it" pays from
// her saved PayPal with no PayPal page (src/lib/bills.ts). The saved PayPal's id stays on the server: the browser
// only ever learns whether she is connected. Every PayPal POST here has its request id stored before the call.

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { recordEvent } from "@/lib/events";
import type { Family } from "@/lib/family";
import { createVaultPaymentToken, createVaultSetupToken } from "@/lib/paypal-vault";

function parentOf(family: Family) {
  const parent = family.members.find((m) => m.role === "parent");
  if (!parent) throw new Error("this family has no parent");
  return parent;
}

/** Margaret's saved PayPal (the vault id), or null when she hasn't connected. Server only. */
export async function savedPayPal(family: Pick<Family, "id">): Promise<string | null> {
  const [row] = await db()<{ vault_id: string | null }[]>`
    select paypal_vault_id as vault_id from members where family_id = ${family.id} and role = 'parent' limit 1`;
  return row?.vault_id ?? null;
}

/** "Connect PayPal": a setup token for her to approve. Returns PayPal's approval page. */
export async function startConnect(family: Family, sessionId: string, origin: string): Promise<string> {
  const parent = parentOf(family);
  const sql = db();
  // Both request ids are stored before either call (hard rule 4).
  const [setup] = await sql<{ id: string; setup_request_id: string }[]>`
    insert into vault_setups (demo_session_id, family_id, member_id, setup_request_id, token_request_id, status)
    values (${sessionId}, ${family.id}, ${parent.id}, ${randomUUID()}, ${randomUUID()}, 'creating')
    returning id, setup_request_id`;
  if (!setup) throw new Error("vault setup insert returned nothing");
  const token = await createVaultSetupToken({
    requestId: setup.setup_request_id,
    returnUrl: `${origin}/parent/connect/return`,
    cancelUrl: `${origin}/parent/connect/cancelled`,
  });
  await sql`update vault_setups set paypal_setup_token_id = ${token.setupTokenId}, status = ${token.status} where id = ${setup.id}`;
  return token.approveUrl;
}

/**
 * Back from PayPal: turn her approved setup token into the saved PayPal. Only setup tokens this session started are
 * considered, so one visitor can't finish another's; the one PayPal names on the return wins (she may have started
 * twice), else the latest. Safe to run again.
 */
export async function finishConnect(family: Family, sessionId: string, namedByPayPal: string[]): Promise<void> {
  const parent = parentOf(family);
  const sql = db();
  const started = await sql<{ id: string; token_request_id: string; setup_token_id: string; status: string }[]>`
    select id, token_request_id, paypal_setup_token_id as setup_token_id, status from vault_setups
    where family_id = ${family.id} and member_id = ${parent.id} and paypal_setup_token_id is not null
    order by created_at desc limit 5`;
  const setup = started.find((s) => namedByPayPal.includes(s.setup_token_id)) ?? started[0];
  if (!setup) throw new Error("no PayPal connection was started in this session");
  if (setup.status === "VAULTED") return;

  const saved = await createVaultPaymentToken({ requestId: setup.token_request_id, setupTokenId: setup.setup_token_id });
  await sql.begin(async (tx) => {
    await tx`
      update members set paypal_vault_id = ${saved.vaultId}, paypal_customer_id = ${saved.customerId ?? null}, vaulted_at = now()
      where id = ${parent.id} and family_id = ${family.id}`;
    await tx`update vault_setups set status = 'VAULTED' where id = ${setup.id}`;
    await recordEvent(tx, family, sessionId, "paypal:vaulted", { member: parent.name });
  });
}

/** She backed out on PayPal's page: nothing was saved. */
export async function cancelConnect(family: Family): Promise<void> {
  await db()`
    update vault_setups set status = 'CANCELLED'
    where family_id = ${family.id} and status not in ('VAULTED', 'CANCELLED')`;
}

/** PayPal no longer knows her saved PayPal (it refused the vault id): forget it, so she is asked to connect again. */
export async function forgetSavedPayPal(family: Pick<Family, "id">, vaultId: string): Promise<void> {
  await db()`
    update members set paypal_vault_id = null, paypal_customer_id = null, vaulted_at = null
    where family_id = ${family.id} and role = 'parent' and paypal_vault_id = ${vaultId}`;
}
