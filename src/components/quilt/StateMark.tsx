export type MarkState = "waiting" | "settled" | "declined" | "processing";

/** One mark in a fixed cell per entry: open while waiting, filled when settled, struck through when not paid. */
export function StateMark({ state, fabric = "var(--margaret)" }: { state: MarkState; fabric?: string }) {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      {state === "settled" && (
        <>
          <circle cx="18" cy="18" r="16" fill={fabric} />
          <path d="M11 18.5l4.5 4.5L25 13.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {state === "waiting" && <circle cx="18" cy="18" r="14.5" fill="none" stroke="var(--thread-rose)" strokeWidth="3" />}
      {state === "declined" && (
        <>
          <circle cx="18" cy="18" r="14.5" fill="none" stroke="var(--ink-muted)" strokeWidth="2.5" />
          <path d="M8 28L28 8" stroke="var(--ink-muted)" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
      {state === "processing" && (
        <circle cx="18" cy="18" r="14.5" fill="none" stroke="var(--ink-muted)" strokeWidth="3" strokeDasharray="5 5" />
      )}
    </svg>
  );
}
