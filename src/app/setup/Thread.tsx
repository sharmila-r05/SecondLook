import styles from "./setup.module.css";

/**
 * The thread round a block, drawn just inside its edge. Its colour and dashes come from the block it sits in (a fine
 * running stitch once sewn, the organizer's basting while a step is still open). Decorative.
 */
export function Thread() {
  return (
    <svg className={styles.thread} aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="100%" height="100%" rx="7" ry="7" />
    </svg>
  );
}
