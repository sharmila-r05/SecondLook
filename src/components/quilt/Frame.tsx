import Link from "next/link";
import type { ReactNode } from "react";
import { FourPatch } from "./FourPatch";
import styles from "./Frame.module.css";
import { ResetDemo } from "./ResetDemo";

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
 * person and has Reset, which asks once before it clears anything; the welcome and sign-in pages pass no `role`, so nobody is selected and only `barEnd` (such as
 * Sign out) sits at the right. Mom's tablet and Rosa's phone in a family someone set up are `locked` to their own
 * screen, so their bar has neither (lib/device-lock). The wordmark always goes back to the welcome page.
 */
export function Frame({ role, locked = false, barEnd, children }: { role?: DemoRole; locked?: boolean; barEnd?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <Link href="/" className={styles.brand}>
          <FourPatch />
          <span>Second Look</span>
        </Link>
        <p className={styles.sandbox}>Sandbox — no real money</p>
        {role && !locked && (
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
            <ResetDemo />
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
