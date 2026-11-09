"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

/**
 * Keeps the family screen current without a reload: a fresh server render every few seconds while the tab is
 * visible, at once when it becomes visible again, and at once when an alert arrives (the service worker says so).
 * router.refresh() keeps scroll position and anything typed, so a new hold just appears in place.
 */
export function LiveRefresh({ everyMs = 4000 }: { everyMs?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);

  useEffect(() => {
    busy.current = pending;
  }, [pending]);

  useEffect(() => {
    const refresh = () => {
      // One at a time: a slow render is never stacked with another.
      if (busy.current || document.visibilityState !== "visible") return;
      startTransition(() => router.refresh());
    };
    const timer = window.setInterval(refresh, everyMs);
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: unknown } | null)?.type === "second-look:changed") refresh();
    };
    document.addEventListener("visibilitychange", refresh);
    const worker = "serviceWorker" in navigator ? navigator.serviceWorker : null;
    worker?.addEventListener("message", onMessage);
    worker?.startMessages();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      worker?.removeEventListener("message", onMessage);
    };
  }, [router, everyMs]);

  return null;
}
