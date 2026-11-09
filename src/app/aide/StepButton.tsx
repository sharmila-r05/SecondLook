"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { noteTap } from "./Arrived";

/** Rosa's one button per step. While it saves, it says so and can't be tapped twice. */
export function StepButton({
  id,
  className,
  decor,
  pending,
  children,
}: {
  /** For the step before to hand focus to this button when her tap brings it in. */
  id?: string;
  className?: string;
  /** The stitch and icon, kept while the label changes. */
  decor?: ReactNode;
  pending: string;
  children: ReactNode;
}) {
  const status = useFormStatus();
  return (
    <button
      id={id}
      type="submit"
      className={className}
      disabled={status.pending}
      aria-busy={status.pending || undefined}
      onClick={noteTap}
    >
      {decor}
      <span>{status.pending ? pending : children}</span>
    </button>
  );
}
