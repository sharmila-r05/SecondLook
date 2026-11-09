import { NextResponse } from "next/server";
import { getAccount, returnToAccountFamily } from "@/lib/account";
import { homeFor } from "@/lib/home";

export const dynamic = "force-dynamic";

/** "Set up your family" and "Go to your family": sign in first, then this device opens the account's family. */
export async function GET() {
  const account = await getAccount();
  if (!account) return redirectTo("/signin");
  await returnToAccountFamily(account);
  return redirectTo((await homeFor(account.sessionId, account.person, account)) ?? "/setup");
}

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });
}
