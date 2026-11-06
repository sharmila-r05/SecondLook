import { House } from "lucide-react";
import Link from "next/link";
import { Frame } from "@/components/quilt/Frame";
import { Stitch } from "@/components/quilt/Stitch";
import { db } from "@/lib/db";
import { ensureFamily, memberNamed } from "@/lib/family";
import { getSessionId } from "@/lib/session";
import { formatTime, localDate } from "@/lib/time";
import { confirmVisitToday } from "../actions";
import styles from "../ask.module.css";

export const dynamic = "force-dynamic";

export default async function ConfirmVisit() {
  const family = await ensureFamily(await getSessionId());
  const aide = memberNamed(family, "aide") ?? "The aide";
  const [already] = await db()<{ at: Date }[]>`
    select coalesce(checked_in_at, created_at) as at from visits
    where family_id = ${family.id} and visit_date = ${localDate(new Date())}::date`;

  return (
    <Frame role="margaret">
      <section className={styles.ask} aria-labelledby="ask-heading">
        <House className={styles.symbol} aria-hidden="true" />
        {already ? (
          <>
            <h1 id="ask-heading" className={styles.question}>
              {aide} came today
            </h1>
            <p className={styles.note}>It&rsquo;s already noted, at {formatTime(already.at)}.</p>
            <div className={styles.answers}>
              <Link href="/parent" className={`${styles.answer} ${styles.yes}`}>
                <Stitch kind="light" />
                Back to today
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 id="ask-heading" className={styles.question}>
              Did {aide} come today?
            </h1>
            <div className={styles.answers}>
              <form action={confirmVisitToday} className={styles.answerForm}>
                <button type="submit" className={`${styles.answer} ${styles.yes}`}>
                  <Stitch kind="light" />
                  Yes, {aide} came
                </button>
              </form>
              <Link href="/parent" className={`${styles.answer} ${styles.no}`}>
                Go back
              </Link>
            </div>
          </>
        )}
      </section>
    </Frame>
  );
}
