"use server";

import { checkCode, type SignInState, sendSignIn, startOver } from "./actions";

/**
 * The sign-in page's one form action: the email step, the code step, or "Use a different email". One action keeps both
 * stages on one `useActionState`, and as a server action the form still works before the page's script has loaded.
 */
export async function signInStep(prev: SignInState, form: FormData): Promise<SignInState> {
  if (form.get("intent") === "over") return startOver(prev);
  return form.get("step") === "code" && prev.stage === "code" ? checkCode(prev, form) : sendSignIn(prev, form);
}
