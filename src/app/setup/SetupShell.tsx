import Link from "next/link";
import type { ReactNode } from "react";
import { FourPatch } from "@/components/quilt/FourPatch";
import frame from "@/components/quilt/Frame.module.css";
import styles from "./setup.module.css";
import { StartOver } from "./StartOver";

/**
 * The plum border while the family is still being set up: the same bar as every screen, but no person tabs yet (their
 * screens open once the family is set up). On the steps, "Start over" (named for whoever is setting it up) asks once,
 * then begins the setup again from Mom's bills.
 */
export function SetupShell({ startOver, children }: { startOver?: "Sarah" | "Tom"; children: ReactNode }) {
  return (
    <div className={frame.shell}>
      <header className={frame.bar}>
        <Link href="/setup" className={frame.brand}>
          <FourPatch />
          <span>Second Look</span>
        </Link>
        <p className={frame.sandbox}>Sandbox — no real money</p>
        {startOver && <StartOver organizer={startOver} />}
        <form action="/signout" method="post" className={frame.resetForm}>
          <button type="submit" className={`${frame.role} ${styles.barButton}`}>
            Sign out
          </button>
        </form>
      </header>
      <main className={frame.main}>{children}</main>
    </div>
  );
}
