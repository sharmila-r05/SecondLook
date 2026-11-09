"use client";

import { Bell, BellOff, BellRing, Share, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import styles from "./AlertsToggle.module.css";

type As = "sarah" | "tom";
type State = "checking" | "unsupported" | "install" | "off" | "busy" | "on" | "elsewhere" | "blocked" | "failed";

const NAME: Record<As, string> = { sarah: "Sarah", tom: "Tom" };
// Whose phone this is, so Tom's view on Sarah's phone doesn't claim his alerts are on. A convenience only: the
// server's row is what decides who gets the push.
const OWNER_KEY = "sl_alerts_for";

function storedOwner(): As | null {
  try {
    const v = localStorage.getItem(OWNER_KEY);
    return v === "sarah" || v === "tom" ? v : null;
  } catch {
    return null;
  }
}

function storeOwner(as: As | null) {
  try {
    if (as) localStorage.setItem(OWNER_KEY, as);
    else localStorage.removeItem(OWNER_KEY);
  } catch {
    // Private mode: alerts still work, the label just can't tell whose phone it is.
  }
}

function supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** iPhone and iPad only get push from a Home Screen app (iOS 16.4+), never from a Safari tab. */
function needsHomeScreen(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && !window.matchMedia("(display-mode: standalone)").matches;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function save(sub: PushSubscription, as: As): Promise<void> {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON(), as }),
  });
  if (!res.ok) throw new Error(`saving the subscription failed: ${res.status}`);
}

/** A browser whose push service never answers gets "try again" instead of a button stuck on "Turning on…". */
function withinSeconds<T>(seconds: number, work: Promise<T>): Promise<T> {
  return Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("push service timed out")), seconds * 1000))]);
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

// The quiet one-line states. Each says what still works, so a phone without alerts never looks broken.
const LINES: Record<"on" | "blocked" | "unsupported" | "install", { icon: LucideIcon; text: string }> = {
  on: { icon: BellRing, text: "Alerts are on for this phone." },
  blocked: { icon: BellOff, text: "Alerts are blocked in this browser’s settings. This screen still updates on its own." },
  unsupported: { icon: BellOff, text: "This browser can’t show alerts. This screen still updates on its own." },
  install: { icon: Share, text: "For alerts on this iPhone, tap Share, then Add to Home Screen, and open Second Look from there." },
};

/** "Get alerts on this phone": asks for permission only on the tap, then links this browser to Sarah or Tom. */
export function AlertsToggle({ as, publicKey }: { as: As; publicKey: string }) {
  const [state, setState] = useState<State>("checking");
  const [owner, setOwner] = useState<As>(as);

  useEffect(() => {
    let live = true;
    const settle = (next: State) => live && setState(next);
    (async () => {
      if (!supported()) return settle(needsHomeScreen() ? "install" : "unsupported");
      if (Notification.permission === "denied") return settle("blocked");
      const sub = await (await registration()).pushManager.getSubscription();
      if (!sub || Notification.permission !== "granted") return settle("off");
      const whose = storedOwner() ?? as;
      if (live) setOwner(whose);
      // Re-link it: Reset gives the session a new family, and the old link goes with the old one.
      await save(sub, whose).catch(() => undefined);
      settle(whose === as ? "on" : "elsewhere");
    })().catch(() => settle("off"));
    return () => {
      live = false;
    };
  }, [as]);

  async function turnOn() {
    setState("busy");
    try {
      // First thing in the tap: Safari only asks from inside the user's gesture.
      const permission = await Notification.requestPermission();
      if (permission === "denied") return setState("blocked");
      if (permission !== "granted") return setState("off");
      const reg = await registration();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await withinSeconds(20, reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })));
      await save(sub, as);
      storeOwner(as);
      setOwner(as);
      setState("on");
    } catch {
      setState("failed");
    }
  }

  async function turnOff() {
    setState("busy");
    try {
      const sub = await (await registration()).pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      storeOwner(null);
      setState("off");
    } catch {
      setState("on");
    }
  }

  if (state === "off" || state === "busy" || state === "failed") {
    return (
      <div className={styles.alerts} aria-live="polite">
        <button type="button" className={styles.turnOn} onClick={turnOn} disabled={state === "busy"} aria-busy={state === "busy"}>
          <Bell className={styles.buttonIcon} aria-hidden="true" />
          {state === "busy" ? "Turning on alerts…" : "Get alerts on this phone"}
        </button>
        {state === "failed" && <p className={styles.line}>That didn’t work. Try once more in a moment.</p>}
      </div>
    );
  }

  if (state === "elsewhere") {
    return (
      <div className={styles.alerts} aria-live="polite">
        <p className={styles.line}>
          <BellRing className={styles.icon} aria-hidden="true" />
          <span>
            This phone’s alerts go to {NAME[owner]}.{" "}
            <button type="button" className={styles.link} onClick={turnOn}>
              Send them to {NAME[as]}
            </button>
          </span>
        </p>
      </div>
    );
  }

  // Until the browser has been asked, hold the button's space so nothing below moves.
  if (state === "checking") return <div className={styles.alerts} aria-hidden="true" />;

  const line = LINES[state];
  const Icon = line.icon;
  return (
    <div className={styles.alerts} aria-live="polite">
      <p className={styles.line}>
        <Icon className={styles.icon} aria-hidden="true" />
        <span>
          {line.text}
          {state === "on" && (
            <>
              {" "}
              <button type="button" className={styles.link} onClick={turnOff}>
                Turn off
              </button>
            </>
          )}
        </span>
      </p>
    </div>
  );
}
