// "Open on your phone": a short-lived code that lets a second device join this visitor's demo session (hard rule 10
// still holds: the phone sees only this session's family). The session id itself never goes into a QR code or a URL.

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i
const CODE = /^[a-hjkmnp-z2-9]{10}$/;

export function newJoinCode(): string {
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function isJoinCode(value: unknown): value is string {
  return typeof value === "string" && CODE.test(value);
}

/** This session's current code: reused while it has 5+ minutes left, so the QR stays the same across refreshes. */
export async function joinCodeFor(sessionId: string): Promise<string> {
  const sql = db();
  const [current] = await sql<{ code: string }[]>`
    select code from join_codes where demo_session_id = ${sessionId} and expires_at > now() + interval '5 minutes'
    order by expires_at desc limit 1`;
  if (current) return current.code;
  await sql`delete from join_codes where expires_at < now()`;
  const code = newJoinCode();
  await sql`insert into join_codes (code, demo_session_id, expires_at) values (${code}, ${sessionId}, now() + interval '15 minutes')`;
  return code;
}

/** The session a code joins, if it's still valid. */
export async function sessionForCode(code: string): Promise<string | null> {
  if (!isJoinCode(code)) return null;
  const [row] = await db()<{ demo_session_id: string }[]>`
    select demo_session_id from join_codes where code = ${code} and expires_at > now()`;
  return row?.demo_session_id ?? null;
}
