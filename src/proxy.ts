import { type NextRequest, NextResponse } from "next/server";
import { isSessionId, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/session-cookie";

/** Gives every visitor their own demo family: a random session id in an httpOnly cookie. */
export function proxy(request: NextRequest) {
  if (isSessionId(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  const id = crypto.randomUUID();
  // Also put it on this request, so the very first render already belongs to the new session.
  request.cookies.set(SESSION_COOKIE, id);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: id,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export const config = {
  // Not the PayPal webhook (no browser, no session) and not the health check; never static assets or icons.
  matcher: ["/((?!api/paypal/webhook|api/health|join/|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|icons/).*)"],
};
