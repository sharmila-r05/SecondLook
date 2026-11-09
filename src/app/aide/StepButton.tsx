"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** Rosa's one button per step. While it saves, it says so and can't be tapped twice. */
export function StepButton({
  className,
  decor,
  pending,
  children,
}: {
  className?: string;
  /** The stitch and icon, kept while the label changes. */
  decor?: ReactNode;
  pending: string;
  children: ReactNode;
}) {
  const status = useFormStatus();
  return (
    <button type="submit" className={className} disabled={status.pending} aria-busy={status.pending || undefined}>
      {decor}
      <span>{status.pending ? pending : children}</span>
    </button>
  );
}
