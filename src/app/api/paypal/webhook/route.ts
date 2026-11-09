import { db } from "@/lib/db";
import { PayPalError, verifyWebhookSignature } from "@/lib/paypal";
import { handleWebhook, type WebhookEvent } from "@/lib/webhook";

export const dynamic = "force-dynamic";

/**
 * PayPal webhook deliveries. Verified with PayPal's postback, deduplicated by event id, then applied. A verified event
 * always gets 200, even if handling failed (logged), so PayPal doesn't retry for days. Logs carry the event type and
 * outcome only, never the body.
 */
export async function POST(request: Request) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return new Response("webhook not configured", { status: 503 });

  const raw = await request.text();
  let event: WebhookEvent;
  try {
    event = JSON.parse(raw) as WebhookEvent;
  } catch {
    return new Response("bad body", { status: 400 });
  }

  let verified = false;
  try {
    verified = await verifyWebhookSignature({ headers: request.headers, event, webhookId });
  } catch (err) {
    console.error("webhook verification failed:", err instanceof PayPalError ? `${err.issue} (debug_id ${err.debugId})` : err);
    return new Response("verification unavailable", { status: 503 });
  }
  if (!verified || !event.id) {
    console.warn(`webhook ${event.event_type ?? "?"} rejected: signature not verified`);
    return new Response("not verified", { status: 401 });
  }

  const fresh = await db()`insert into paypal_webhook_events (event_id) values (${event.id}) on conflict do nothing returning event_id`;
  if (fresh.length === 0) return Response.json({ ok: true, duplicate: true });

  try {
    const outcome = await handleWebhook(event);
    console.log(`webhook ${event.event_type} verified: ${outcome}`);
  } catch (err) {
    console.error(`webhook ${event.event_type} handling failed:`, err instanceof Error ? err.message : err);
  }
  return Response.json({ ok: true });
}
