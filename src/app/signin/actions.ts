"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { rememberSignIn } from "@/lib/account";
import { consumeCode, normalizeEmail, requestSignIn, signIn } from "@/lib/auth";
import { homeFor } from "@/lib/home";
import { publicOrigin } from "@/lib/redirect";
import { getDevicePerson, getSessionId } from "@/lib/session";

/** What the sign-in page shows: asking for the address, then waiting for the code (with a message when needed). */
export type SignInState =
  | { stage: "email"; email: string; error?: string }
  | { stage: "code"; email: string; error?: string; devLink?: string; devCode?: string };

const SEND_ERRORS = {
  bad_email: "That doesn’t look like an email address. Check it and try again.",
  over_cap: "We’ve sent a lot of sign-in emails just now. Try again in a little while.",
  not_configured: "Signing in by email isn’t switched on here yet. You can still see the ready-made family.",
  send_failed: "The email didn’t go out. Try again in a moment.",
} as const;

const CODE_ERRORS = {
  wrong: "That code isn’t right. Check the email and try again.",
  expired: "That code has expired. Send a new one.",
  too_many: "Too many tries with that code. Send a new one.",
} as const;

/** Step 1: send the link and code to the address typed. */
export async function sendSignIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const typed = String(form.get("email") ?? "").slice(0, 254);
  const email = normalizeEmail(typed);
  if (!email) return { stage: "email", email: typed, error: SEND_ERRORS.bad_email };
  const result = await requestSignIn({ email, sessionId: await getSessionId(), origin: publicOrigin(await headers()) });
  if (!result.ok) return { stage: "email", email, error: SEND_ERRORS[result.reason] };
  return { stage: "code", email, devLink: result.devLink, devCode: result.devCode };
}

/** Step 2: the six-digit code from the email, typed on this device. */
export async function checkCode(prev: SignInState, form: FormData): Promise<SignInState> {
  const email = prev.email;
  const sessionId = await getSessionId();
  const result = await consumeCode({ email, code: String(form.get("code") ?? ""), sessionId });
  if (!result.ok) {
    return result.reason === "wrong" ? { ...prev, stage: "code", error: CODE_ERRORS.wrong } : { stage: "email", email, error: CODE_ERRORS[result.reason] };
  }
  const account = await signIn(result.emailHash, { sessionId, person: await getDevicePerson() });
  await rememberSignIn(account);
  // Straight to the page, not via /api/account/home: a server action's redirect to a route handler leaves the
  // browser on that route's URL, and the next form posted from the page fails.
  redirect((await homeFor(account.sessionId, account.person, account)) ?? "/setup");
}

/** "Use a different email": back to step 1. */
export async function startOver(prev: SignInState): Promise<SignInState> {
  return { stage: "email", email: prev.email };
}
