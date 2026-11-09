import { Clock, House, Mic, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { after } from "next/server";
import { Frame } from "@/components/quilt/Frame";
import { StateMark } from "@/components/quilt/StateMark";
import { Stitch } from "@/components/quilt/Stitch";
import { sweepExpiredHolds, sweepOtherExpiredHolds } from "@/lib/bills";
import { type AgreementCopy, agreementCopy, CONNECT_COPY, orderForParent, parentLine } from "@/lib/copy/parent";
import { ensureFamily, type Family, getParentDay, memberNamed, organizerOf } from "@/lib/family";
import { getSessionId } from "@/lib/session";
import { formatDay } from "@/lib/time";
import { savedPayPal } from "@/lib/vault";
import { agreeToSecondLook, connectPayPal } from "./actions";
import { AgreeButton } from "./AgreeButton";
import { ConnectButton } from "./ConnectButton";
import styles from "./parent.module.css";

const LINE_ICONS: Record<AgreementCopy["lines"][number]["key"], typeof Wallet> = { bills: Wallet, family: Users, wait: Clock };

/**
 * A family just set up: before anything else, who set Second Look up with Margaret, what it does in three plain
 * sentences, and one large yes in place of her two action blocks. Pay and "Rosa came today" open once she agrees.
 */
function Agreement({ family }: { family: Family }) {
  const organizer = organizerOf(family);
  const copy = agreementCopy({
    organizer: organizer?.name ?? "Your family",
    sibling: family.members.find((m) => m.role === "child" && m.id !== organizer?.id)?.name ?? null,
    ask: family.settings.ask,
    holdMinutes: family.settings.holdMinutes,
  });
  return (
    <Frame role="margaret">
      <div className={styles.layout} data-agree="">
        <section className={styles.today} aria-labelledby="agree-heading">
          <Stitch kind="light" />
          <h1 id="agree-heading" className={styles.heading}>
            {copy.heading}
          </h1>
          <ul className={styles.entries}>
            {copy.lines.map((line) => {
              const Icon = LINE_ICONS[line.key];
              return (
                <li key={line.key} className={`${styles.entry} ${styles.statement}`}>
                  <Stitch kind="sewn" />
                  <span className={styles.mark}>
                    <Icon className={styles.lineIcon} aria-hidden="true" />
                  </span>
                  <p>{line.text}</p>
                </li>
              );
            })}
          </ul>
        </section>
        <form action={agreeToSecondLook} className={styles.agree}>
          <AgreeButton label={copy.button} pending={copy.pending} />
        </form>
      </div>
    </Frame>
  );
}

const NOTICES: Record<string, string> = {
  problem: "PayPal didn’t finish that payment, so nothing was paid. You can try again.",
  connected: CONNECT_COPY.connected,
  "not-connected": CONNECT_COPY.notConnected,
};

// Today's date and entries change through the day.
export const dynamic = "force-dynamic";

export default async function ParentHome({ searchParams }: { searchParams: Promise<{ paypal?: string }> }) {
  const now = new Date();
  const sessionId = await getSessionId();
  const family = await ensureFamily(sessionId);
  await sweepExpiredHolds(family, sessionId);
  after(() => sweepOtherExpiredHolds());
  if (!family.settings.parentAgreedAt) return <Agreement family={family} />;
  const { paypal } = await searchParams;
  const notice = paypal ? NOTICES[paypal] : undefined;
  const lines = orderForParent(await getParentDay(family, now)).map(parentLine);
  const aide = memberNamed(family, "aide") ?? "The aide";
  const connected = (await savedPayPal(family)) !== null;

  return (
    <Frame role="margaret">
      <div className={styles.layout}>
        <section className={styles.today} aria-labelledby="today-heading">
          <Stitch kind="light" />
          <h1 id="today-heading" className={styles.heading}>
            Today, {formatDay(now)}
          </h1>
          {notice && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}
          {lines.length === 0 ? (
            <div className={styles.empty}>
              <p>Nothing yet today.</p>
              <p className={styles.emptyHint}>Bills you pay and {aide}&rsquo;s visits will show here.</p>
            </div>
          ) : (
            <ul className={styles.entries}>
              {lines.map((line) => (
                <li key={line.id} className={styles.entry} data-stitch={line.stitch}>
                  <Stitch kind={line.stitch} />
                  <span className={styles.mark}>
                    <StateMark state={line.mark} fabric={line.fabric} />
                  </span>
                  <p className={styles.title}>{line.title}</p>
                  {line.amount && <p className={styles.amount}>{line.amount}</p>}
                  <p className={styles.detail}>{line.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <nav className={styles.actions} aria-label="What would you like to do?">
          <Link href="/parent/pay" className={`${styles.action} ${styles.pay}`}>
            <Stitch kind="light" />
            <Mic className={styles.icon} aria-hidden="true" />
            <span>Pay a bill</span>
          </Link>
          <Link href="/parent/visit" className={`${styles.action} ${styles.visit}`}>
            <Stitch kind="light" />
            <House className={styles.icon} aria-hidden="true" />
            <span>{aide} came today</span>
          </Link>
        </nav>

        {!connected && (
          <section className={styles.connect} aria-labelledby="connect-heading">
            <div className={styles.connectText}>
              <h2 id="connect-heading" className={styles.connectHeading}>
                {CONNECT_COPY.heading}
              </h2>
              <p className={styles.connectBody}>{CONNECT_COPY.body}</p>
            </div>
            <form action={connectPayPal} className={styles.connectForm}>
              <ConnectButton />
            </form>
          </section>
        )}
      </div>
    </Frame>
  );
}
