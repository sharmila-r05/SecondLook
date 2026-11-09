"use client";

import { useFormStatus } from "react-dom";
import { Stitch } from "@/components/quilt/Stitch";
import { CONNECT_COPY } from "@/lib/copy/parent";
import styles from "./parent.module.css";

/** The one button in "Connect your PayPal once": says it's working while PayPal's page loads. */
export function ConnectButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.connectButton} disabled={pending}>
      <Stitch kind="light" />
      {pending ? CONNECT_COPY.pending : CONNECT_COPY.button}
    </button>
  );
}
