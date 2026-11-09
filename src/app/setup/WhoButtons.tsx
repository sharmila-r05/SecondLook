"use client";

import { useFormStatus } from "react-dom";
import styles from "./setup.module.css";
import { Thread } from "./Thread";

const PEOPLE = [
  { name: "Sarah", role: "Mom’s daughter", fabric: "sarah" },
  { name: "Tom", role: "Mom’s son", fabric: "tom" },
] as const;

/** "I'm Sarah" and "I'm Tom", each a block of their fabric. The tapped one says it's starting; neither taps twice. */
export function WhoButtons() {
  const { pending, data } = useFormStatus();
  const chosen = pending ? data?.get("person") : null;
  return (
    <>
      {PEOPLE.map((p) => (
        <button
          key={p.name}
          type="submit"
          name="person"
          value={p.name}
          className={`${styles.whoBlock} ${styles.fabric}`}
          data-fabric={p.fabric}
          disabled={pending}
          aria-busy={chosen === p.name || undefined}
        >
          <Thread />
          <span className={styles.whoName}>
            <span className="visually-hidden">I&rsquo;m </span>
            {p.name}
          </span>
          <span className={styles.whoRole}>{chosen === p.name ? "Starting…" : p.role}</span>
        </button>
      ))}
    </>
  );
}
