import { Check } from "lucide-react";
import Link from "next/link";
import type { SetupStep } from "@/lib/settings";
import styles from "./setup.module.css";
import { Thread } from "./Thread";

/** Sewn once saved (in the organizer's fabric), open while it's the step still to save, unsewn until reached. */
export type StepState = "sewn" | "open" | "unsewn";

export interface ProgressStep {
  key: SetupStep;
  label: string;
  /** What was chosen, shown beside the column on a wide screen once the step is sewn. */
  summary?: string;
  state: StepState;
  /** Set when the organizer can go back to this step. */
  href?: string;
}

const SPOKEN: Record<StepState, string> = { sewn: "done", open: "not saved yet", unsewn: "not yet" };

/** The four steps as a row of quilt blocks in the plum border (a column of them beside the form on a wide screen). */
export function Progress({ steps, here, organizer }: { steps: ProgressStep[]; here: SetupStep; organizer: "Sarah" | "Tom" }) {
  return (
    <nav className={styles.progress} aria-labelledby="setup-progress">
      <div className={styles.progressHead}>
        <p id="setup-progress" className={styles.progressTitle}>
          Setting up Mom&rsquo;s family
        </p>
        <p>by {organizer}</p>
      </div>
      <ol className={`${styles.steps} ${styles.fabric}`} data-fabric={organizer.toLowerCase()}>
        {steps.map((step) => {
          const current = step.key === here;
          const inner = (
            <>
              {step.state !== "unsewn" && <Thread />}
              {step.state === "sewn" && <Check className={styles.stepTick} aria-hidden="true" />}
              <span className={styles.stepLabel}>{step.label}</span>
              <span className="visually-hidden">, {current ? "you’re here" : SPOKEN[step.state]}</span>
              {step.state === "sewn" && step.summary && <span className={styles.stepSummary}>{step.summary}</span>}
              {step.state === "open" && !current && (
                <span className={styles.stepSummary} aria-hidden="true">
                  Up next
                </span>
              )}
              {current && step.state !== "sewn" && (
                <span className={styles.stepSummary} aria-hidden="true">
                  You&rsquo;re here
                </span>
              )}
            </>
          );
          return (
            <li key={step.key}>
              {step.href && !current ? (
                <Link href={step.href} className={styles.step} data-state={step.state}>
                  {inner}
                </Link>
              ) : (
                <span className={styles.step} data-state={step.state} aria-current={current ? "step" : undefined}>
                  {inner}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
