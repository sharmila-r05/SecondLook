import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./FormError.module.css";

/** What went wrong, said aloud as it appears. `id` lets a field or group point at it with aria-describedby. */
export function FormError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className={styles.error} role="alert">
      <CircleAlert className={styles.icon} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** The server's words as a sentence: typeset apostrophes and a full stop. */
export function sentence(text: string): string {
  const typeset = text.replace(/'/g, "’");
  return /[.!?]$/.test(typeset) ? typeset : `${typeset}.`;
}
