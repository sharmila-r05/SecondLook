import type { Metadata } from "next";
import { after } from "next/server";
import { FabricKey } from "@/components/ledger/FabricKey";
import { LiveRefresh } from "@/components/ledger/LiveRefresh";
import { PayPalStepsGrid } from "@/components/ledger/PayPalStepsGrid";
import { WeekQuilt } from "@/components/ledger/WeekQuilt";
import { Frame } from "@/components/quilt/Frame";
import { sweepExpiredHolds, sweepOtherExpiredHolds } from "@/lib/bills";
import { refreshCare } from "@/lib/care";
import { ensureFamily } from "@/lib/family";
import { buildLedger } from "@/lib/ledger";
import { getLedgerInput } from "@/lib/ledger-data";
import { getSessionId } from "@/lib/session";
import styles from "./ledger.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared ledger · Second Look",
};

export default async function LedgerPage() {
  const sessionId = await getSessionId();
  const family = await ensureFamily(sessionId);
  // The same lazy sweep the family screen runs, so a hold nobody answered reads as cancelled here too.
  await sweepExpiredHolds(family, sessionId);
  after(() => sweepOtherExpiredHolds());
  // And a sibling's invoice paid on PayPal shows as paid here without opening the care screen.
  await refreshCare(family, sessionId);
  const ledger = buildLedger(await getLedgerInput(family));

  return (
    <Frame role="ledger">
      <div className={styles.page}>
        <header className={styles.head}>
          <div className={styles.intro}>
            <h1 className={styles.heading}>Shared ledger</h1>
            <p className={styles.lede}>One record of every money move in Margaret&rsquo;s family, with who set it going and why.</p>
          </div>
          <FabricKey />
        </header>

        <WeekQuilt weeks={ledger.weeks} initialSelected={ledger.selected} />

        <section className={styles.steps} aria-labelledby="paypal-steps">
          <div className={styles.stepsHead}>
            <h2 id="paypal-steps" className={styles.subheading}>
              Every PayPal step
            </h2>
            <p className={styles.lede}>
              Each call Second Look made to the PayPal sandbox, the ID PayPal returned, and the PayPal-Request-Id saved before
              the call so a retry can never pay twice.
            </p>
          </div>
          <PayPalStepsGrid rows={ledger.steps} />
        </section>
      </div>
      <LiveRefresh />
    </Frame>
  );
}
