import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordEvent } from "@/lib/events";
import { joinTarget, markJoined } from "@/lib/join";
import { cookieOptions, DEVICE_COOKIE, isPerson, type Person, screenOf, SESSION_COOKIE } from "@/lib/session-cookie";

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

  // An invite opens as its person; the family screen's own QR code opens as the child whose screen showed it. Either
  // way the device remembers whose it is, so the app on its home screen opens there too (/open), not the welcome page.
  const person: Person | null = !target ? null : target.member && isPerson(target.member.name) ? target.member.name : asTom ? "Tom" : "Sarah";
  const location = !target || !person ? "/?join=expired" : screenOf(person);
  // A relative Location resolves against the address the device used (see lib/redirect).
  const response = new NextResponse(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
  if (!target || !person) return response;

  response.cookies.set({ name: SESSION_COOKIE, value: target.sessionId, ...cookieOptions() });
  response.cookies.set({ name: DEVICE_COOKIE, value: person, ...cookieOptions() });
  if (target.member && (await markJoined(target.member.id))) {
    await recordEvent(db(), { id: target.member.familyId }, target.sessionId, "member:joined", { by: target.member.name });
  }
  return response;
}
