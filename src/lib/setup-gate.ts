import { redirect } from "next/navigation";
import type { Family } from "@/lib/family";

/** A family still being set up has no family screens yet: the organizer finishes the setup first. */
export function requireSetUp(family: Family): void {
  if (family.settings.origin === "setup" && !family.settings.setupCompletedAt) redirect("/setup");
}

/** Margaret pays and confirms visits only after she has agreed, on her own screen. */
export function requireParentAgreed(family: Family): void {
  if (!family.settings.parentAgreedAt) redirect("/parent");
}
