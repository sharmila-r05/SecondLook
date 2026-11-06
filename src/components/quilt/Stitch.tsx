import styles from "./Stitch.module.css";

export type StitchKind = "sewn" | "basting" | "pulled" | "light";

/**
 * The thread around a block: a fine running stitch once something is settled, long loose rose basting while it waits
 * for family, basting pulled loose when family said no. Decorative; the state is always also said in words.
 */
export function Stitch({ kind }: { kind: StitchKind }) {
  return (
    <svg className={`${styles.stitch} ${styles[kind]}`} aria-hidden="true" focusable="false">
      <rect className={styles.thread} x="0" y="0" width="100%" height="100%" rx="9" ry="9" />
    </svg>
  );
}
