import { NextResponse } from "next/server";
import { deviceLock } from "@/lib/device-lock";
import { ensureFamily } from "@/lib/family";
import { parseSubscription, removeSubscription, saveSubscription, vapidPublicKey } from "@/lib/push";
import { getSessionId } from "@/lib/session";

export const dynamic = "force-dynamic";

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** "Get alerts on this phone": stores this browser's subscription with Sarah or Tom in the visitor's own session. */
export async function POST(request: Request) {
  if (!vapidPublicKey()) return NextResponse.json({ error: "alerts aren't set up" }, { status: 503 });
  const body = await readJson(request);
  const subscription = parseSubscription(body?.subscription);
  if (!subscription) return NextResponse.json({ error: "not a push subscription" }, { status: 400 });

  const sessionId = await getSessionId();
  const family = await ensureFamily(sessionId);
  // Mom's tablet and Rosa's phone never get the family's alerts (lib/device-lock).
  if (await deviceLock(family)) return NextResponse.json({ error: "alerts are for Sarah and Tom" }, { status: 403 });
  const name = body?.as === "tom" ? "Tom" : "Sarah";
  const member = family.members.find((m) => m.role === "child" && m.name === name);
  if (!member) return NextResponse.json({ error: "no such family member" }, { status: 404 });

  await saveSubscription(sessionId, member.id, subscription);
  return NextResponse.json({ for: member.name });
}

/** "Turn off": forgets this browser's subscription, in this session only. */
export async function DELETE(request: Request) {
  const body = await readJson(request);
  const endpoint = body?.endpoint;
  if (typeof endpoint !== "string" || endpoint.length > 2048) return NextResponse.json({ error: "no endpoint" }, { status: 400 });
  await removeSubscription(await getSessionId(), endpoint);
  return new NextResponse(null, { status: 204 });
}
