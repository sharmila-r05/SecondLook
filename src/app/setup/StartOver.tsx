"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import frame from "@/components/quilt/Frame.module.css";
import { chooseOrganizer } from "./actions";
import { PendingButton } from "./fields";
import styles from "./setup.module.css";

/**
 * "Start over" in the bar, asked once before anything is cleared: the setup begins again from Mom's bills, with the
 * same person setting it up. (The demo's Reset keeps a family's setup and clears only what it did, so it isn't this.)
 */
export function StartOver({ organizer }: { organizer: "Sarah" | "Tom" }) {
  const [asking, setAsking] = useState(false);
  const open = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);

  // The safe answer has focus when the question opens; closing it returns focus to the bar's button.
  useEffect(() => {
    if (asking) keep.current?.focus();
  }, [asking]);

  const close = () => {
    setAsking(false);
    open.current?.focus();
  };

  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };

  return (
    <>
      <button
        ref={open}
        type="button"
        className={`${frame.reset} ${styles.barButton}`}
        aria-expanded={asking}
        aria-controls={asking ? "start-over" : undefined}
        onClick={() => setAsking((now) => !now)}
      >
        Start over
      </button>
      {asking && (
        <form id="start-over" action={chooseOrganizer} className={styles.startOver} role="group" aria-labelledby="start-over-question" onKeyDown={escape}>
          <input type="hidden" name="person" value={organizer} />
          <p id="start-over-question" className={styles.startOverText}>
            <strong>Start over?</strong> This clears Mom&rsquo;s bills and rules, and begins the setup again.
          </p>
          <div className={styles.startOverButtons}>
            <PendingButton className={styles.startOverYes} pending="Starting over…">
              Start over
            </PendingButton>
            <button ref={keep} type="button" className={styles.startOverNo} onClick={close}>
              Keep going
            </button>
          </div>
        </form>
      )}
    </>
  );
}
