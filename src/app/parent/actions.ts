"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { VISIT_RATE_CENTS } from "@/lib/demo/seed";
import { recordEvent } from "@/lib/events";
import { ensureFamily } from "@/lib/family";
import { getSessionId } from "@/lib/session";
import { localDate } from "@/lib/time";

/** Margaret says the aide came today. One visit per day: saying it twice changes nothing. */
export async function confirmVisitToday(): Promise<void> {
  const sessionId = await getSessionId();
  const family = await ensureFamily(sessionId);
  const aide = family.members.find((m) => m.role === "aide");
  if (!aide) throw new Error("this family has no aide");

  const now = new Date();
  await db().begin(async (tx) => {
    const inserted = await tx`
      insert into visits (demo_session_id, family_id, aide_member_id, visit_date, confirmed_by, rate_cents, created_at)
      values (${sessionId}, ${family.id}, ${aide.id}, ${localDate(now)}, 'parent', ${VISIT_RATE_CENTS}, ${now})
      on conflict (aide_member_id, visit_date) do nothing
      returning id`;
    if (inserted.length > 0) {
      await recordEvent(tx, family, sessionId, "visit:confirmed", { by: "Margaret", aide: aide.name, rateCents: VISIT_RATE_CENTS });
    }
  });
  redirect("/parent");
}
