// Setting a family up, and changing its rules later. The organizer (Sarah or Tom) goes through three steps: Mom's
// regular bills, the rules for a second look, care costs. Then the family is set up, and the last screen sends the
// invites (Mom's tablet, the sibling's phone, Rosa's phone), which stay reachable from the family's Rules tab. The
// same writes serve that tab afterwards. Every write is scoped to one family, which
// belongs to one demo session (hard rule 10), and is recorded as an event with who made it.

import type postgres from "postgres";
import { db } from "@/lib/db";
import { catalogPayee, PAYEE_CATALOG } from "@/lib/demo/payees";
import { recordEvent } from "@/lib/events";
import type { Family } from "@/lib/family";
import {
  type Care,
  type Rules,
  SETUP_STEPS,
  type SetupStep,
  SettingsError,
  splitRule,
  typedCents,
  USUAL_AMOUNT_RANGE,
} from "@/lib/settings";

export interface BillChoice {
  key: string;
  usualAmountCents: number;
}

/** The Bills form: one checkbox per catalog payee ("pay:electric"), each with its usual amount ("usual:electric"). */
export function parseBills(form: FormData): BillChoice[] {
  return PAYEE_CATALOG.filter((p) => form.get(`pay:${p.key}`) === "on").map((p) => ({
    key: p.key,
    usualAmountCents: typedCents(form.get(`usual:${p.key}`), USUAL_AMOUNT_RANGE, `The usual amount for ${p.name}`),
  }));
}

/** The step after this one, never going backwards: the organizer can revisit an earlier step without losing place. */
function nextStep(current: SetupStep | null, done: SetupStep): SetupStep | null {
  const at = SETUP_STEPS.indexOf(done);
  const next = SETUP_STEPS[at + 1] ?? null;
  if (current === null) return null;
  return SETUP_STEPS.indexOf(current) > at ? current : next;
}

async function advance(tx: postgres.TransactionSql, family: Family, sessionId: string, by: string, done: SetupStep) {
  if (family.settings.setupCompletedAt) return;
  const next = nextStep(family.settings.setupStep, done) ?? "devices";
  if (next !== "devices") {
    await tx`update families set setup_step = ${next} where id = ${family.id}`;
    return;
  }
  // The rules are all chosen: the family is set up. Invites come next, and Margaret agrees on her own screen.
  const finished = await tx`
    update families set setup_step = null, setup_completed_at = now()
    where id = ${family.id} and setup_completed_at is null returning id`;
  if (finished.length > 0) await recordEvent(tx, family, sessionId, "family:setup_done", { by });
}

function memberName(family: Family, memberId: string): string {
  const found = family.members.find((m) => m.id === memberId);
  if (!found) throw new SettingsError("that person isn't in this family");
  return found.name;
}

/**
 * Mom's regular bills: the chosen catalog payees become known (each with its usual amount), the others stop being
 * known. A payee someone was already paid stays in the history; it only leaves the list.
 */
export async function saveBills(family: Family, sessionId: string, byMemberId: string, choices: BillChoice[]): Promise<void> {
  const by = memberName(family, byMemberId);
  await db().begin(async (tx) => {
    for (const payee of PAYEE_CATALOG) {
      const chosen = choices.find((c) => c.key === payee.key);
      const [existing] = await tx<{ id: string }[]>`
        select id from payees where family_id = ${family.id} and paypal_email = ${payee.paypalEmail} limit 1`;
      if (existing) {
        await tx`
          update payees set known = ${Boolean(chosen)},
                            usual_amount_cents = coalesce(${chosen?.usualAmountCents ?? null}::bigint, usual_amount_cents)
          where id = ${existing.id}`;
      } else if (chosen) {
        const p = catalogPayee(chosen.key);
        if (!p) continue;
        await tx`
          insert into payees (demo_session_id, family_id, name, aliases, paypal_email, known, usual_amount_cents)
          values (${sessionId}, ${family.id}, ${p.name}, ${p.aliases}, ${p.paypalEmail}, true, ${chosen.usualAmountCents})`;
      }
    }
    await recordEvent(tx, family, sessionId, "family:bills_set", { by, payees: choices.map((c) => c.key).join(",") });
    await advance(tx, family, sessionId, by, "bills");
  });
}

/** The rules for a second look: Mom's limit, her daily limit, "times the usual", how long a hold waits, who's asked. */
export async function saveRules(family: Family, sessionId: string, byMemberId: string, rules: Rules): Promise<void> {
  const by = memberName(family, byMemberId);
  await db().begin(async (tx) => {
    await tx`
      update families set limit_cents = ${rules.limitCents}, daily_limit_cents = ${rules.dailyLimitCents},
                          unusual_multiple = ${rules.unusualMultiple}, hold_minutes = ${rules.holdMinutes}, ask = ${rules.ask}
      where id = ${family.id}`;
    await recordEvent(tx, family, sessionId, "family:rules_set", { by, ...rules });
    await advance(tx, family, sessionId, by, "rules");
  });
}

/** Care costs: Rosa's rate from her next visit on (visits already logged keep theirs), and Sarah's and Tom's split. */
export async function saveCare(family: Family, sessionId: string, byMemberId: string, care: Care): Promise<void> {
  const by = memberName(family, byMemberId);
  const sarah = family.members.find((m) => m.name === "Sarah");
  const tom = family.members.find((m) => m.name === "Tom");
  if (!sarah || !tom) throw new SettingsError("this family has no Sarah and Tom to split between");
  await db().begin(async (tx) => {
    await tx`
      update families set visit_rate_cents = ${care.visitRateCents},
                          split_rule = ${tx.json(splitRule(sarah.id, tom.id, care.sarahShare))}
      where id = ${family.id}`;
    await recordEvent(tx, family, sessionId, "family:care_set", { by, ...care });
    await advance(tx, family, sessionId, by, "care");
  });
}

/** Margaret says yes to Second Look on her own screen, once. */
export async function parentAgrees(family: Family, sessionId: string): Promise<void> {
  await db().begin(async (tx) => {
    const agreed = await tx`
      update families set parent_agreed_at = now() where id = ${family.id} and parent_agreed_at is null returning id`;
    if (agreed.length > 0) await recordEvent(tx, family, sessionId, "parent:agreed", { by: "Margaret" });
  });
}

/**
 * Demo only: a judge without Margaret's sandbox login can skip her PayPal page and use the hosted demo's saved PayPal
 * (DEMO_PARENT_VAULT_ID), the one every ready-made family uses. False when the demo has none.
 */
export async function applyDemoSavedPayPal(family: Family): Promise<boolean> {
  const vaultId = process.env.DEMO_PARENT_VAULT_ID;
  if (!vaultId) return false;
  await db()`
    update members set paypal_vault_id = ${vaultId}, vaulted_at = now()
    where family_id = ${family.id} and role = 'parent' and paypal_vault_id is null`;
  return true;
}

/** Whether the demo can offer that skip. */
export function demoSavedPayPalAvailable(): boolean {
  return Boolean(process.env.DEMO_PARENT_VAULT_ID);
}
