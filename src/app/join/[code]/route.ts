import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordEvent } from "@/lib/events";
import { joinTarget, markJoined } from "@/lib/join";
import { cookieOptions, DEVICE_COOKIE, isPerson, screenOf, SESSION_COOKIE } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

/**
 * Opening an invite or scanning "Open on your phone": this device joins the same demo session and opens the right
 * screen. An invite opens as its person (Margaret's tablet, the sibling's phone, Rosa's phone) and remembers it; the
 * family screen's own QR code opens Sarah's (or Tom's) screen.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const asTom = new URL(request.url).searchParams.get("as") === "tom";
  const target = await joinTarget(code);

  const person = target?.member && isPerson(target.member.name) ? target.member.name : null;
  const location = !target ? "/?join=expired" : person ? screenOf(person) : asTom ? "/family?as=tom" : "/family";
  // A relative Location resolves against the address the device used (see lib/redirect).
  const response = new NextResponse(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
  if (!target) return response;

  response.cookies.set({ name: SESSION_COOKIE, value: target.sessionId, ...cookieOptions() });
  if (person) response.cookies.set({ name: DEVICE_COOKIE, value: person, ...cookieOptions() });
  if (target.member && (await markJoined(target.member.id))) {
    await recordEvent(db(), { id: target.member.familyId }, target.sessionId, "member:joined", { by: target.member.name });
  }
  return response;
}
