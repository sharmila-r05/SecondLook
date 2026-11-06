// Cost caps (hard rule 9): every paid call takes a slot from this visitor's session and from today's total first, in one
// transaction. Over either cap, the call isn't made and the free fallback is used instead.

import type postgres from "postgres";
import { db } from "@/lib/db";

export type UsageKind = "llm" | "voice_seconds";

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const LLM_CAPS = {
  perSession: positiveInt(process.env.SESSION_LLM_CALLS_CAP, 20),
  perDay: positiveInt(process.env.DAILY_LLM_CALLS_CAP, 200),
};

class OverCap extends Error {}

async function bump(tx: postgres.TransactionSql, scope: string, kind: UsageKind, cap: number) {
  const rows = await tx`
    insert into usage_counters (scope, kind, count) values (${scope}, ${kind}, 1)
    on conflict (scope, kind) do update set count = usage_counters.count + 1 where usage_counters.count < ${cap}
    returning count`;
  if (rows.length === 0) throw new OverCap(scope);
}

/** Takes one LLM call from the session's and the day's allowance (UTC day). False when either is used up. */
export async function takeLlmCall(sessionId: string, now = new Date()): Promise<boolean> {
  try {
    await db().begin(async (tx) => {
      await bump(tx, `session:${sessionId}`, "llm", LLM_CAPS.perSession);
      await bump(tx, `day:${now.toISOString().slice(0, 10)}`, "llm", LLM_CAPS.perDay);
    });
    return true;
  } catch (err) {
    if (err instanceof OverCap) return false;
    throw err;
  }
}
