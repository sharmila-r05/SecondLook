"use client";

import { useFormStatus } from "react-dom";

/**
 * Deny and Approve. PayPal takes a few seconds to void or capture, so while it works the tapped button says what is
 * happening and neither can be tapped twice.
 */
export function DecideButtons({ denyClass, approveClass }: { denyClass: string | undefined; approveClass: string | undefined }) {
  const { pending, data } = useFormStatus();
  const choice = pending ? data?.get("decision") : null;
  return (
    <>
      <button type="submit" name="decision" value="deny" className={denyClass} disabled={pending} aria-busy={choice === "deny" || undefined}>
        {choice === "deny" ? "Cancelling…" : "Deny and cancel"}
      </button>
      <button type="submit" name="decision" value="approve" className={approveClass} disabled={pending} aria-busy={choice === "approve" || undefined}>
        {choice === "approve" ? "Paying…" : "Approve and pay"}
      </button>
    </>
  );
}
