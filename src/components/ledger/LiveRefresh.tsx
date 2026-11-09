"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-reads the page every few seconds while it's on screen, so a payment Sarah approves on her phone or an invoice Tom
 * pays stitches into the open ledger without a reload. Client state (the selected block) is kept.
 */
export function LiveRefresh({ everyMs = 10_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => window.clearInterval(timer);
  }, [router, everyMs]);
  return null;
}
