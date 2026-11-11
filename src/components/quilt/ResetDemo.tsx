"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import styles from "./Frame.module.css";

/**
 * The demo's Reset, asked once in the bar before anything is cleared, as "Start over" asks on the setup steps. It
 * clears what happened in this family (payments, visits, decisions); the family and how it was set up stay.
 */
export function ResetDemo() {
  const [asking, setAsking] = useState(false);
  const [resetting, setResetting] = useState(false);
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
        className={styles.reset}
        aria-expanded={asking}
        aria-controls={asking ? "reset-demo" : undefined}
        onClick={() => setAsking((now) => !now)}
      >
        Reset
      </button>
      {asking && (
        <form
          id="reset-demo"
          action="/api/demo/reset"
          method="post"
          className={styles.ask}
          role="group"
          aria-labelledby="reset-demo-question"
          onKeyDown={escape}
          onSubmit={() => setResetting(true)}
        >
          <p id="reset-demo-question" className={styles.askText}>
            <strong>Reset the demo?</strong> This clears every payment, visit and decision in this family, so you can try it
            again from the start.
          </p>
          <div className={styles.askButtons}>
            <button type="submit" className={styles.askYes} disabled={resetting} aria-busy={resetting || undefined}>
              {resetting ? "Resetting…" : "Reset"}
            </button>
            <button ref={keep} type="button" className={styles.askNo} onClick={close} disabled={resetting}>
              Keep going
            </button>
          </div>
        </form>
      )}
    </>
  );
}
