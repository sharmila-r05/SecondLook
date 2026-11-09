import { ensureFamily } from "@/lib/family";
import { getSessionId } from "@/lib/session";
import { cancelConnect } from "@/lib/vault";
import { seeOther } from "@/lib/redirect";

export const dynamic = "force-dynamic";

/** Margaret backed out on PayPal's page: nothing was saved, and the bills keep asking PayPal each time. */
export async function GET() {
  await cancelConnect(await ensureFamily(await getSessionId()));
  return seeOther("/parent?paypal=not-connected");
}
