import { vapidPublicKey } from "@/lib/push";
import { AlertsToggle } from "./AlertsToggle";

/** The alerts control, server-rendered with the VAPID public key (the only push setting a browser may see). */
export function FamilyAlerts({ as }: { as: "sarah" | "tom" }) {
  const publicKey = vapidPublicKey();
  // Without VAPID keys push quietly does nothing; the screen's own refresh still shows a hold.
  return publicKey ? <AlertsToggle as={as} publicKey={publicKey} /> : null;
}
