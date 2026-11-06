import { Frame } from "@/components/quilt/Frame";
import { PayFlow } from "./PayFlow";

export const dynamic = "force-dynamic";

export default function PayABill() {
  return (
    <Frame role="margaret">
      <PayFlow />
    </Frame>
  );
}
