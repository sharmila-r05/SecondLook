"use client";

import { Check } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Stitch } from "@/components/quilt/Stitch";
import styles from "./parent.module.css";

/** Margaret's one yes: a tall block in her teal, like "Pay a bill". Says it's working once tapped. */
export function AgreeButton({ label, pending: pendingLabel }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${styles.action} ${styles.pay} ${styles.agreeButton}`} disabled={pending} aria-busy={pending || undefined}>
      <Stitch kind="light" />
      <Check className={styles.icon} aria-hidden="true" />
      <span>{pending ? pendingLabel : label}</span>
    </button>
  );
}
