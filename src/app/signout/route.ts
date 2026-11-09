import { forgetSignIn } from "@/lib/account";
import { seeOther } from "@/lib/redirect";

export const dynamic = "force-dynamic";

/** Sign out on this device. The family stays as it is; signing in again comes back to it. */
export async function POST() {
  await forgetSignIn();
  return seeOther("/");
}
