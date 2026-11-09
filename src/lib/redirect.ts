// Redirects that work behind Render's proxy: a relative Location resolves against the address the browser used, so an
// internal host or port can never leak into a redirect.

/** 303 See Other to a path on this site. Only a path is accepted, so it can't become an open redirect. */
export function seeOther(path: string): Response {
  const safe = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  return new Response(null, { status: 303, headers: { Location: safe, "Cache-Control": "no-store" } });
}

/** The public origin for links PayPal sends the visitor back to (these must be absolute). */
export function publicOrigin(headers: Headers): string {
  const configured = process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL;
  if (configured) return configured.replace(/\/+$/, "");
  return `${headers.get("x-forwarded-proto") ?? "http"}://${headers.get("x-forwarded-host") ?? headers.get("host")}`;
}
