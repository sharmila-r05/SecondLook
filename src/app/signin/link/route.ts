import { rememberSignIn } from "@/lib/account";
import { consumeLink, signIn } from "@/lib/auth";
import { homeFor } from "@/lib/home";
import { seeOther } from "@/lib/redirect";
import { getDevicePerson, getSessionId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The link in the sign-in email. Works once, on whichever device opens it. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const verified = await consumeLink(token);
  if (!verified) return seeOther("/signin?link=expired");
  const account = await signIn(verified.emailHash, { sessionId: await getSessionId(), person: await getDevicePerson() });
  await rememberSignIn(account);
  return seeOther((await homeFor(account.sessionId, account.person, account)) ?? "/setup");
}
