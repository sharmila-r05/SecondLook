import { Frame } from "@/components/quilt/Frame";
import { keepDeviceTo } from "@/lib/device-lock";
import { ensureFamily } from "@/lib/family";
import { getSessionId } from "@/lib/session";
import { requireParentAgreed } from "@/lib/setup-gate";
import { PayFlow } from "./PayFlow";

export const dynamic = "force-dynamic";

export default async function PayABill() {
  const family = await ensureFamily(await getSessionId());
  const locked = await keepDeviceTo(["Margaret"], family);
  requireParentAgreed(family);
  return (
    <Frame role="margaret" locked={locked}>
      <PayFlow />
    </Frame>
  );
}
