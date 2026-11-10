"use client";

import { Check, Copy, Mail, Share2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import styles from "./InviteCard.module.css";

const noSubscribe = () => () => {};

/** The Web Share sheet where the browser has one (phones, Safari); otherwise an email link. */
function useCanShare(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => typeof navigator.share === "function",
    () => false,
  );
}

type Copied = "idle" | "copied" | "failed";

/** "secondlook.example" and "/join/abc123": the site and the person's own part, without the "https://". */
function splitLink(url: string): { site: string; path: string } {
  try {
    const link = new URL(url);
    return { site: link.host, path: `${link.pathname}${link.search}` };
  } catch {
    return { site: "", path: url };
  }
}

/** One person's invite link, with Copy and Share. The link itself stays visible so it can be read out or typed. */
export function InviteShare({ url, name, message }: { url: string; name: string; message: string }) {
  const canShare = useCanShare();
  const [copied, setCopied] = useState<Copied>("idle");
  const { site, path } = splitLink(url);
  const linkRef = useRef<HTMLParagraphElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // No clipboard here (an insecure page, or the browser said no): once the whole link is showing, select it so it can
  // be copied by hand.
  useEffect(() => {
    if (copied !== "failed" || !linkRef.current) return;
    const range = document.createRange();
    range.selectNodeContents(linkRef.current);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }, [copied]);

  function settle(next: Copied) {
    setCopied(next);
    window.clearTimeout(timer.current);
    if (next === "copied") timer.current = window.setTimeout(() => setCopied("idle"), 2500);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      settle("copied");
    } catch {
      settle("failed");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "Second Look", text: message, url });
    } catch (err) {
      // Closing the share sheet isn't a failure; anything else falls back to copying.
      if (!(err instanceof DOMException && err.name === "AbortError")) await copy();
    }
  }

  const mailto = `mailto:?subject=${encodeURIComponent(`${name}’s link to Second Look`)}&body=${encodeURIComponent(`${message}\n\n${url}`)}`;

  return (
    <div className={styles.share}>
      {/* One line, never broken mid-code: the site's name gives way to an ellipsis first, so the person's own code at the
          end stays readable; Copy carries the whole link. If copying fails, the whole link opens out, selected. */}
      <p
        ref={linkRef}
        className={styles.url}
        title={url}
        data-full={copied === "failed" || undefined}
        // Copied by hand from here, it's still the whole link, on one line.
        onCopy={(event) => {
          event.preventDefault();
          event.clipboardData.setData("text/plain", url);
        }}
      >
        {copied === "failed" ? (
          url
        ) : (
          <>
            <span className={styles.urlSite}>{site}</span>
            <span className={styles.urlPath}>{path}</span>
          </>
        )}
      </p>
      <div className={styles.buttons}>
        <button type="button" className={styles.button} onClick={copy}>
          {copied === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied === "copied" ? "Copied" : "Copy link"}
          <span className="visually-hidden"> for {name}</span>
        </button>
        {canShare ? (
          <button type="button" className={styles.button} onClick={share}>
            <Share2 aria-hidden="true" />
            Share<span className="visually-hidden"> {name}&rsquo;s link</span>
          </button>
        ) : (
          <a className={styles.button} href={mailto}>
            <Mail aria-hidden="true" />
            Email<span className="visually-hidden"> {name}&rsquo;s link</span>
          </a>
        )}
      </div>
      <p className="visually-hidden" aria-live="polite">
        {copied === "copied" && `${name}’s link copied.`}
        {copied === "failed" && "Couldn’t copy here. The link is selected: copy it from the menu."}
      </p>
      {copied === "failed" && (
        <p className={styles.failed} aria-hidden="true">
          Couldn&rsquo;t copy here. The link is selected: copy it from the menu.
        </p>
      )}
    </div>
  );
}
