// The events table drives the ledger: every money move and every family decision is written here, with who and why.

import type postgres from "postgres";
import type { Family } from "@/lib/family";

export type EventType =
  | "visit:confirmed"
  | "visit:checked_in"
  | "visit:checked_out"
  | "request:created"
  | "request:approved_auto"
  | "request:held"
  | "request:approved"
  | "request:denied"
  | "request:expired"
  | "request:paid"
  | "paypal:authorized"
  | "paypal:captured"
  | "paypal:voided"
  | "paypal:payout"
  | "paypal:invoice_sent"
  | "paypal:invoice_paid"
  | "week:closed"
  | "ai:note";

export async function recordEvent(
  sql: postgres.Sql | postgres.TransactionSql,
  family: Pick<Family, "id">,
  sessionId: string,
  type: EventType,
  payload: Record<string, string | number | boolean | null>,
): Promise<void> {
  await sql`
    insert into events (demo_session_id, family_id, type, payload)
    values (${sessionId}, ${family.id}, ${type}, ${sql.json(payload)})`;
}
