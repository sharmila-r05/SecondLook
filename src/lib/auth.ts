// Signing in by email, for whoever sets up a family (and anyone in it who wants to come back from another device).
// The address is used once, to send the link, and never stored: an account is found again by an HMAC of it. Links
// and codes are stored only as hashes, work once, for 15 minutes; a code allows five tries. Sending is capped per
// session, per address and per day (hard rule 9), well under Resend's free 100 a day.

import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type postgres from "postgres";
import { db } from "@/lib/db";
import { emailConfigured, sendSignInEmail } from "@/lib/email";
import { isPerson, type Person } from "@/lib/session-cookie";

export const SIGN_IN_MINUTES = 15;
export const MAX_CODE_TRIES = 5;
export const ACCOUNT_COOKIE = "sl_account";

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const EMAIL_CAPS = {
  perSession: positiveInt(process.env.SESSION_EMAILS_CAP, 6),
  perAddressPerDay: positiveInt(process.env.ADDRESS_EMAILS_CAP, 5),
  perDay: positiveInt(process.env.DAILY_EMAILS_CAP, 90),
};

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET is not set (32+ characters)");
  return value;
}

function hmac(purpose: string, value: string): string {
  return createHmac("sha256", secret()).update(`${purpose}:${value}`).digest("base64url");
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Trimmed and lowercased, or null when it can't be an address. Deliberately loose: the email itself is the test. */
export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/.test(email)) return null;
  return email;
}

export function emailHash(email: string): string {
  return hmac("email", email);
}

/** "sl_account" holds the account id and its HMAC, so it can't be forged or edited. */
export function signAccount(accountId: string): string {
  return `${accountId}.${hmac("account", accountId)}`;
}

export function verifyAccountCookie(value: string | undefined): string | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot < 0) return null;
  const id = value.slice(0, dot);
  return sameText(value.slice(dot + 1), hmac("account", id)) ? id : null;
}

class OverCap extends Error {}

async function bump(tx: postgres.TransactionSql, scope: string, cap: number) {
  const rows = await tx`
    insert into usage_counters (scope, kind, count) values (${scope}, 'email', 1)
    on conflict (scope, kind) do update set count = usage_counters.count + 1 where usage_counters.count < ${cap}
    returning count`;
  if (rows.length === 0) throw new OverCap(scope);
}

export type SignInRequest =
  | { ok: true; devLink?: string; devCode?: string }
  | { ok: false; reason: "bad_email" | "over_cap" | "not_configured" | "send_failed" };

/**
 * Sends a sign-in link and code to the address typed. Without Resend configured, a development server shows the link
 * and code on the page instead (never in production, never in a log).
 */
export async function requestSignIn(input: { email: string; sessionId: string; origin: string; now?: Date }): Promise<SignInRequest> {
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, reason: "bad_email" };
  const devOnly = !emailConfigured() && process.env.NODE_ENV !== "production";
  if (!emailConfigured() && !devOnly) return { ok: false, reason: "not_configured" };

  const hash = emailHash(email);
  const day = (input.now ?? new Date()).toISOString().slice(0, 10);
  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

  try {
    await db().begin(async (tx) => {
      await bump(tx, `signin:session:${input.sessionId}`, EMAIL_CAPS.perSession);
      await bump(tx, `signin:address:${hash}:${day}`, EMAIL_CAPS.perAddressPerDay);
      await bump(tx, `day:${day}`, EMAIL_CAPS.perDay);
      // A new request replaces any earlier one for this address from this session.
      await tx`update sign_in_codes set used_at = now() where email_hash = ${hash} and demo_session_id = ${input.sessionId} and used_at is null`;
      await tx`
        insert into sign_in_codes (id, demo_session_id, email_hash, token_hash, code_hash, expires_at)
        values (${id}, ${input.sessionId}, ${hash}, ${hmac("token", token)}, ${hmac("code", `${id}:${code}`)},
                now() + make_interval(mins => ${SIGN_IN_MINUTES}))`;
    });
  } catch (err) {
    if (err instanceof OverCap) return { ok: false, reason: "over_cap" };
    throw err;
  }

  const link = `${input.origin}/signin/link?t=${token}`;
  if (devOnly) return { ok: true, devLink: link, devCode: code };
  const sent = await sendSignInEmail({ to: email, link, code, idempotencyKey: `signin-${id}` });
  return sent.sent ? { ok: true } : { ok: false, reason: sent.reason === "not_configured" ? "not_configured" : "send_failed" };
}

/** The emailed link: valid once, until it expires. */
export async function consumeLink(token: string): Promise<{ emailHash: string } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [row] = await db()<{ email_hash: string }[]>`
    update sign_in_codes set used_at = now()
    where token_hash = ${hmac("token", token)} and used_at is null and expires_at > now()
    returning email_hash`;
  return row ? { emailHash: row.email_hash } : null;
}

export type CodeCheck = { ok: true; emailHash: string } | { ok: false; reason: "wrong" | "expired" | "too_many" };

/** The typed code, for the address this session asked about. Five wrong tries and that code is spent. */
export async function consumeCode(input: { email: string; code: string; sessionId: string }): Promise<CodeCheck> {
  const email = normalizeEmail(input.email);
  const code = input.code.replace(/\D/g, "");
  if (!email || code.length !== 6) return { ok: false, reason: "wrong" };
  const hash = emailHash(email);
  return db().begin(async (tx) => {
    const [row] = await tx<{ id: string; code_hash: string; attempts: number }[]>`
      select id, code_hash, attempts from sign_in_codes
      where email_hash = ${hash} and demo_session_id = ${input.sessionId} and used_at is null and expires_at > now()
      order by created_at desc limit 1 for update`;
    if (!row) return { ok: false, reason: "expired" } as const;
    if (sameText(row.code_hash, hmac("code", `${row.id}:${code}`))) {
      await tx`update sign_in_codes set used_at = now() where id = ${row.id}`;
      return { ok: true, emailHash: hash } as const;
    }
    const tries = row.attempts + 1;
    await tx`update sign_in_codes set attempts = ${tries}, used_at = case when ${tries} >= ${MAX_CODE_TRIES} then now() else null end
             where id = ${row.id}`;
    return { ok: false, reason: tries >= MAX_CODE_TRIES ? "too_many" : "wrong" } as const;
  });
}

export interface Account {
  id: string;
  sessionId: string;
  /** Who this account is in its family, once known. */
  person: Person | null;
}

function toAccount(row: { id: string; demo_session_id: string; member_name: string | null }): Account {
  return { id: row.id, sessionId: row.demo_session_id, person: isPerson(row.member_name) ? row.member_name : null };
}

/**
 * The account for a verified address, made on first sign-in. A new account joins the family this device was invited
 * into, as the person it was invited as (the sibling signing in after opening their invite); otherwise it starts a
 * session of its own, for a family it will set up.
 */
export async function signIn(hash: string, device: { sessionId: string; person: Person | null }): Promise<Account> {
  return db().begin(async (tx) => {
    const [existing] = await tx<{ id: string; demo_session_id: string; member_name: string | null }[]>`
      update accounts set last_sign_in_at = now() where email_hash = ${hash}
      returning id, demo_session_id, member_name`;
    if (existing) return toAccount(existing);

    let sessionId: string = randomUUID();
    let person: Person | null = null;
    if (device.person) {
      const [joined] = await tx<{ id: string }[]>`
        select f.id from families f
        where f.demo_session_id = ${device.sessionId} and f.origin = 'setup'
          and not exists (select 1 from accounts a where a.demo_session_id = ${device.sessionId} and a.member_name = ${device.person})`;
      if (joined) {
        sessionId = device.sessionId;
        person = device.person;
      }
    }
    const [created] = await tx<{ id: string; demo_session_id: string; member_name: string | null }[]>`
      insert into accounts (email_hash, demo_session_id, member_name, last_sign_in_at)
      values (${hash}, ${sessionId}, ${person}, now())
      returning id, demo_session_id, member_name`;
    if (!created) throw new Error("creating the account returned no row");
    return toAccount(created);
  });
}

export async function loadAccount(accountId: string): Promise<Account | null> {
  const [row] = await db()<{ id: string; demo_session_id: string; member_name: string | null }[]>`
    select id, demo_session_id, member_name from accounts where id = ${accountId}`;
  return row ? toAccount(row) : null;
}
