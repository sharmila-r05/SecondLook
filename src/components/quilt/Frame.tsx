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

/** The plum border every screen sits in, with the demo's role switcher, sandbox label and Reset (brief §4). */
export function Frame({ role, children }: { role: DemoRole; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <Link href={ROLES.find((r) => r.role === role)?.href ?? "/parent"} className={styles.brand}>
          <FourPatch />
          <span>Second Look</span>
        </Link>
        <p className={styles.sandbox}>Sandbox — no real money</p>
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
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
