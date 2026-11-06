import { House, Mic } from "lucide-react";
import Link from "next/link";
import { Frame } from "@/components/quilt/Frame";
import { StateMark } from "@/components/quilt/StateMark";
import { Stitch } from "@/components/quilt/Stitch";
import { orderForParent, parentLine } from "@/lib/copy/parent";
import { ensureFamily, getParentDay, memberNamed } from "@/lib/family";
import { getSessionId } from "@/lib/session";
import { formatDay } from "@/lib/time";
import styles from "./parent.module.css";

// Today's date and entries change through the day.
export const dynamic = "force-dynamic";

export default async function ParentHome() {
  const now = new Date();
  const family = await ensureFamily(await getSessionId());
  const lines = orderForParent(await getParentDay(family, now)).map(parentLine);
  const aide = memberNamed(family, "aide") ?? "The aide";

  return (
    <Frame role="margaret">
      <div className={styles.layout}>
        <section className={styles.today} aria-labelledby="today-heading">
          <h1 id="today-heading" className={styles.heading}>
            Today, {formatDay(now)}
          </h1>
          {lines.length === 0 ? (
            <p className={styles.empty}>Nothing yet today.</p>
          ) : (
            <ul className={styles.entries}>
              {lines.map((line) => (
                <li key={line.id} className={styles.entry} data-stitch={line.stitch}>
                  <Stitch kind={line.stitch} />
                  <span className={styles.mark}>
                    <StateMark state={line.mark} fabric={line.fabric} />
                  </span>
                  <p className={styles.title}>{line.title}</p>
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
      </div>
    </Frame>
  );
}
