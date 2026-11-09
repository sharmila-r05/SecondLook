// The one email Second Look sends: a sign-in link with a six-digit code, to the address the visitor typed for
// themselves. Sent through Resend's REST API from the owner's verified domain (RESEND_API_KEY, EMAIL_FROM). The
// address is never logged or stored (hard rule 6); a failure logs only Resend's status and error name.

export type SendResult = { sent: true } | { sent: false; reason: "not_configured" | "failed" };

export function emailConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

/** "123 456": easier to read and type than six digits in a row. */
export function spacedCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export function signInEmail(link: string, code: string): { subject: string; text: string; html: string } {
  const shown = spacedCode(code);
  const subject = `Your Second Look sign-in code: ${shown}`;
  const text = [
    "Here is your link to sign in to Second Look:",
    "",
    link,
    "",
    `Or type this code on the sign-in page: ${shown}`,
    "",
    "Both work once, for 15 minutes. If you didn't ask to sign in, you can ignore this email.",
    "",
    "Second Look is a hackathon demo on the PayPal sandbox: no real money moves.",
  ].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#f4ece4;font-family:Georgia,'Times New Roman',serif;color:#1a1720">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:2px solid #4a2a4f;border-radius:6px">
<tr><td style="padding:28px 28px 8px;font-size:22px;font-weight:bold;color:#4a2a4f">Sign in to Second Look</td></tr>
<tr><td style="padding:8px 28px;font-size:17px;line-height:1.5">Tap the button to sign in on this device.</td></tr>
<tr><td style="padding:12px 28px 20px"><a href="${link}" style="display:inline-block;background:#4a2a4f;color:#ffffff;text-decoration:none;font-size:18px;padding:14px 24px;border-radius:4px">Sign in</a></td></tr>
<tr><td style="padding:0 28px 8px;font-size:17px;line-height:1.5">Or type this code on the sign-in page:</td></tr>
<tr><td style="padding:0 28px 20px;font-size:30px;letter-spacing:4px;font-family:'Courier New',monospace;font-weight:bold">${shown}</td></tr>
<tr><td style="padding:0 28px 28px;font-size:14px;line-height:1.5;color:#5b5560">Both work once, for 15 minutes. If you didn&rsquo;t ask to sign in, you can ignore this email.<br><br>Second Look is a hackathon demo on the PayPal sandbox: no real money moves.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}

/** Sends the sign-in email. The idempotency key makes a retried request send it once. */
export async function sendSignInEmail(input: { to: string; link: string; code: string; idempotencyKey: string }): Promise<SendResult> {
  if (!emailConfigured()) return { sent: false, reason: "not_configured" };
  const { subject, text, html } = signInEmail(input.link, input.code);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [input.to], subject, text, html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { sent: true };
    const body = (await res.json().catch(() => ({}))) as { name?: string };
    console.error(`sending the sign-in email failed: Resend ${res.status} ${body.name ?? ""}`.trim());
    return { sent: false, reason: "failed" };
  } catch (err) {
    console.error("sending the sign-in email failed:", err instanceof Error ? err.name : "unknown error");
    return { sent: false, reason: "failed" };
  }
}
