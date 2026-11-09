import { NextResponse } from "next/server";
import { sessionForCode } from "@/lib/join";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

/** A phone scanned "Open on your phone": give it the same demo session, then open Sarah's (or Tom's) screen. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const asTom = new URL(request.url).searchParams.get("as") === "tom";
  const sessionId = await sessionForCode(code);
  const target = sessionId ? (asTom ? "/family?as=tom" : "/family") : "/family?join=expired";
  // A relative Location resolves against the address the phone used (see lib/redirect).
  const response = new NextResponse(null, { status: 303, headers: { Location: target, "Cache-Control": "no-store" } });
  if (sessionId) {
    response.cookies.set({
      name: SESSION_COOKIE,
      value: sessionId,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  }
  return response;
}
