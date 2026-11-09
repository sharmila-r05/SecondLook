// Web push to Sarah's and Tom's phones. Sending is never part of a money path: callers hand it to after(), once the
// state is saved, and every failure is swallowed and logged here by status code only (no endpoints, no keys).
// Only VAPID_PUBLIC_KEY ever reaches a browser (hard rule 6). Without the three VAPID settings, push quietly does
// nothing and the family screen's own refresh still shows the hold.

import webpush from "web-push";
import { familyPath, type PushMessage } from "@/lib/copy/push";
import { db } from "@/lib/db";
import type { Family } from "@/lib/family";

export interface StoredSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface Recipient extends StoredSubscription {
  memberName: string;
}

interface Vapid {
  subject: string;
  publicKey: string;
  privateKey: string;
}

type Env = Record<string, string | undefined>;

function vapid(env: Env = process.env): Vapid | null {
  const { VAPID_SUBJECT: subject, VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey } = env;
  return subject && publicKey && privateKey ? { subject, publicKey, privateKey } : null;
}

/** The key a browser subscribes with; null when push isn't set up, so the page shows no alerts control. */
export function vapidPublicKey(env: Env = process.env): string | null {
  return vapid(env)?.publicKey ?? null;
}

// Real browsers' push services only, so a visitor can't make the server post to an address of their choosing.
const PUSH_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];
const KEY = /^[A-Za-z0-9_-]+={0,2}$/;

/** A subscription from the browser, checked: an https endpoint at a known push service and two base64url keys. */
export function parseSubscription(input: unknown): StoredSubscription | null {
  if (!input || typeof input !== "object") return null;
  const { endpoint, keys } = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || endpoint.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))) return null;
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  if (typeof p256dh !== "string" || typeof auth !== "string") return null;
  if (!KEY.test(p256dh) || !KEY.test(auth) || p256dh.length > 200 || auth.length > 100) return null;
  return { endpoint, keys: { p256dh, auth } };
}

/** What the service worker receives: the message, and where tapping it should open for this child. */
export function payloadFor(message: PushMessage, memberName: string): string {
  return JSON.stringify({ title: message.title, body: message.body, tag: message.tag, url: familyPath(memberName) });
}

function statusOf(err: unknown): number | undefined {
  const status = (err as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" ? status : undefined;
}

/**
 * Sends one message to each phone, all at once. Returns the endpoints the push service says are gone (404 or 410:
 * the browser unsubscribed or the subscription expired), for the caller to forget. Never throws.
 */
export async function deliver(recipients: readonly Recipient[], message: PushMessage, keys: Vapid): Promise<string[]> {
  const results = await Promise.allSettled(
    recipients.map(async (r) =>
      webpush.sendNotification({ endpoint: r.endpoint, keys: r.keys }, payloadFor(message, r.memberName), {
        vapidDetails: keys,
        TTL: message.ttlSeconds,
        urgency: message.urgency,
        topic: message.topic,
        timeout: 8000,
      }),
    ),
  );
  const gone: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") return;
    const recipient = recipients[i]!;
    const status = statusOf(result.reason);
    if (status === 404 || status === 410) gone.push(recipient.endpoint);
    else console.error(`push to ${recipient.memberName}'s phone failed: ${status ?? (result.reason as Error)?.name ?? "error"}`);
  });
  return gone;
}

/**
 * Tells this demo session's children (hard rule 10: never another visitor's), except whoever is named in `except`,
 * typically the sibling who just answered. Meant for after(): it never throws.
 */
export async function notifyChildren(
  family: Pick<Family, "id">,
  sessionId: string,
  message: PushMessage,
  { except }: { except?: string } = {},
): Promise<void> {
  const keys = vapid();
  if (!keys) return;
  try {
    const sql = db();
    const rows = await sql<{ endpoint: string; keys: StoredSubscription["keys"]; name: string }[]>`
      select ps.endpoint, ps.keys, m.name
      from push_subscriptions ps
      join members m on m.id = ps.member_id
      join families f on f.id = m.family_id
      where ps.demo_session_id = ${sessionId} and m.family_id = ${family.id} and m.role = 'child'
        and (f.ask = 'everyone' or m.id = f.organizer_member_id)
        and m.id is distinct from ${except ?? null}::uuid`;
    if (rows.length === 0) return;
    const gone = await deliver(
      rows.map((r) => ({ endpoint: r.endpoint, keys: r.keys, memberName: r.name })),
      message,
      keys,
    );
    for (const endpoint of gone) await sql`delete from push_subscriptions where endpoint = ${endpoint}`;
  } catch (err) {
    console.error("push failed:", err instanceof Error ? err.message : "unknown error");
  }
}

const MAX_PER_SESSION = 10;

/** Links this browser's subscription to a child in this session. Re-saving the same endpoint moves it. */
export async function saveSubscription(sessionId: string, memberId: string, sub: StoredSubscription): Promise<void> {
  const sql = db();
  await sql`
    insert into push_subscriptions (endpoint, demo_session_id, member_id, keys)
    values (${sub.endpoint}, ${sessionId}, ${memberId}, ${sql.json(sub.keys)})
    on conflict (endpoint) do update set
      demo_session_id = excluded.demo_session_id, member_id = excluded.member_id, keys = excluded.keys, created_at = now()`;
  // A session keeps its newest few phones at most.
  await sql`
    delete from push_subscriptions where demo_session_id = ${sessionId} and endpoint not in (
      select endpoint from push_subscriptions where demo_session_id = ${sessionId} order by created_at desc limit ${MAX_PER_SESSION})`;
}

export async function removeSubscription(sessionId: string, endpoint: string): Promise<void> {
  await db()`delete from push_subscriptions where endpoint = ${endpoint} and demo_session_id = ${sessionId}`;
}
