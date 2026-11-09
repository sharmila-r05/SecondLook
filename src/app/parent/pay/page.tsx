import { Frame } from "@/components/quilt/Frame";
import { ensureFamily } from "@/lib/family";
import { getSessionId } from "@/lib/session";
import { requireParentAgreed } from "@/lib/setup-gate";
import { PayFlow } from "./PayFlow";

export const dynamic = "force-dynamic";

export default async function PayABill() {
  requireParentAgreed(await ensureFamily(await getSessionId()));
  return (
    <Frame role="margaret">
      <PayFlow />
    </Frame>
  );
}
