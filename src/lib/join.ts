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
    select code from join_codes
    where demo_session_id = ${sessionId} and member_id is null and expires_at > now() + interval '5 minutes'
    order by expires_at desc limit 1`;
  if (current) return current.code;
  await sql`delete from join_codes where expires_at < now()`;
  const code = newJoinCode();
  await sql`insert into join_codes (code, demo_session_id, expires_at) values (${code}, ${sessionId}, now() + interval '15 minutes')`;
  return code;
}

/** The session a code joins, if it's still valid. */
export async function sessionForCode(code: string): Promise<string | null> {
  return (await joinTarget(code))?.sessionId ?? null;
}

export interface JoinTarget {
  sessionId: string;
  /** Who an invite opens as; null for the family screen's own QR code, which opens Sarah's or Tom's screen. */
  member: { id: string; name: string; familyId: string } | null;
}

/** Where a code leads, if it's still valid. */
export async function joinTarget(code: string): Promise<JoinTarget | null> {
  if (!isJoinCode(code)) return null;
  const [row] = await db()<{ demo_session_id: string; member_id: string | null; name: string | null; family_id: string | null }[]>`
    select j.demo_session_id, j.member_id, m.name, m.family_id
    from join_codes j left join members m on m.id = j.member_id
    where j.code = ${code} and j.expires_at > now()`;
  if (!row) return null;
  return {
    sessionId: row.demo_session_id,
    member: row.member_id && row.name && row.family_id ? { id: row.member_id, name: row.name, familyId: row.family_id } : null,
  };
}

/** How long an invite link lasts: long enough to send it and for it to be opened later that week. */
export const INVITE_DAYS = 7;

/**
 * An invite that opens as one person: Margaret's tablet, the sibling's phone, Rosa's phone. Reused while it has more
 * than a day left, so the link the organizer sent keeps working. Gone with the family (Reset makes new people).
 */
export async function inviteCodeFor(sessionId: string, memberId: string): Promise<string> {
  const sql = db();
  const [current] = await sql<{ code: string }[]>`
    select j.code from join_codes j join members m on m.id = j.member_id
    where j.demo_session_id = ${sessionId} and j.member_id = ${memberId} and m.demo_session_id = ${sessionId}
      and j.expires_at > now() + interval '1 day'
    order by j.expires_at desc limit 1`;
  if (current) return current.code;
  const code = newJoinCode();
  await sql`
    insert into join_codes (code, demo_session_id, member_id, expires_at)
    values (${code}, ${sessionId}, ${memberId}, now() + make_interval(days => ${INVITE_DAYS}))`;
  return code;
}

/** A device opened this person's screen from an invite: the first time is worth a line in the organizer's checklist. */
export async function markJoined(memberId: string): Promise<boolean> {
  const rows = await db()`update members set joined_at = now() where id = ${memberId} and joined_at is null returning id`;
  return rows.length > 0;
}
