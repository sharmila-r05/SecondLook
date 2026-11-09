"use server";

import { redirect } from "next/navigation";
import { familyAide } from "@/lib/aide";
import { db } from "@/lib/db";
import { VISIT_RATE_CENTS } from "@/lib/demo/seed";
import { recordEvent } from "@/lib/events";
import { ensureFamily } from "@/lib/family";
import { getSessionId } from "@/lib/session";
import { localDate } from "@/lib/time";

/**
 * Rosa taps "I'm here". One visit per day: if Margaret already said Rosa came, this adds Rosa's arrival time to that
 * same visit; tapping twice changes nothing.
 */
export async function checkIn(): Promise<void> {
  const sessionId = await getSessionId();
  const family = await ensureFamily(sessionId);
  const aide = familyAide(family);

  const now = new Date();
  await db().begin(async (tx) => {
    const touched = await tx<{ rate_cents: string }[]>`
      insert into visits (demo_session_id, family_id, aide_member_id, visit_date, confirmed_by, rate_cents,
                          checked_in_at, created_at)
      values (${sessionId}, ${family.id}, ${aide.id}, ${localDate(now)}, 'aide', ${VISIT_RATE_CENTS}, ${now}, ${now})
      on conflict (aide_member_id, visit_date) do update set checked_in_at = excluded.checked_in_at
        where visits.family_id = excluded.family_id and visits.checked_in_at is null and visits.checked_out_at is null
      returning rate_cents`;
    const [visit] = touched;
    if (visit) {
      await recordEvent(tx, family, sessionId, "visit:checked_in", { by: aide.name, aide: aide.name, rateCents: Number(visit.rate_cents) });
    }
  });
  redirect("/aide");
}

/** Rosa taps "Visit done": today's visit gets its finish time, once. */
export async function checkOut(): Promise<void> {
  const sessionId = await getSessionId();
  const family = await ensureFamily(sessionId);
  const aide = familyAide(family);

  const now = new Date();
  await db().begin(async (tx) => {
    const [visit] = await tx<{ rate_cents: string }[]>`
      update visits set checked_out_at = ${now}
      where family_id = ${family.id} and aide_member_id = ${aide.id} and visit_date = ${localDate(now)}::date
        and checked_out_at is null
      returning rate_cents`;
    if (visit) {
      await recordEvent(tx, family, sessionId, "visit:checked_out", { by: aide.name, aide: aide.name, rateCents: Number(visit.rate_cents) });
    }
  });
  redirect("/aide");
}
