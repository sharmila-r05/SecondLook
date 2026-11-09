import Link from "next/link";
import type { ReactNode } from "react";
import { FourPatch } from "./FourPatch";
import styles from "./Frame.module.css";

export type DemoRole = "margaret" | "sarah" | "tom" | "rosa" | "ledger";

const ROLES: { role: DemoRole; label: string; href: string }[] = [
  { role: "margaret", label: "Margaret", href: "/parent" },
  { role: "sarah", label: "Sarah", href: "/family" },
  { role: "tom", label: "Tom", href: "/family?as=tom" },
  { role: "rosa", label: "Rosa", href: "/aide" },
  { role: "ledger", label: "Ledger", href: "/ledger" },
];

/**
 * The plum border every screen sits in, with the sandbox label (brief §4). Inside a family, the bar also switches
 * person and has Reset; the welcome and sign-in pages pass no `role`, so nobody is selected and only `barEnd` (such as
 * Sign out) sits at the right. The wordmark always goes back to the welcome page and its two doors.
 */
export function Frame({ role, barEnd, children }: { role?: DemoRole; barEnd?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <Link href="/" className={styles.brand}>
          <FourPatch />
          <span>Second Look</span>
        </Link>
        <p className={styles.sandbox}>Sandbox — no real money</p>
        {role && (
          <>
            <nav className={styles.roles} aria-label="Demo: switch person">
              <ul>
                {ROLES.map((r) => (
                  <li key={r.role}>
                    <Link href={r.href} className={styles.role} aria-current={r.role === role ? "page" : undefined}>
                      {r.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <form action="/api/demo/reset" method="post" className={styles.resetForm}>
              <button type="submit" className={styles.reset}>
                Reset
              </button>
            </form>
          </>
        )}
        {barEnd && <div className={styles.barEnd}>{barEnd}</div>}
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}

/** A quiet bar button in the same dashed outline as Reset, for the pages that have no person selected. */
export const barButtonClass = styles.reset;
