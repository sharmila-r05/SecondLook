import { CalendarClock, CircleCheck, DoorOpen } from "lucide-react";
import { Frame } from "@/components/quilt/Frame";
import { StateMark } from "@/components/quilt/StateMark";
import { Stitch } from "@/components/quilt/Stitch";
import { getAideWeek } from "@/lib/aide";
import { todayCard, type VisitRow, visitRow, weekSummary } from "@/lib/copy/aide";
import { ensureFamily } from "@/lib/family";
import { getSessionId } from "@/lib/session";
import { formatDay } from "@/lib/time";
import { checkIn, checkOut } from "./actions";
import styles from "./aide.module.css";
import { StepButton } from "./StepButton";

// Today's visit changes through the day.
export const dynamic = "force-dynamic";

function SettledRow({ row, today = false }: { row: VisitRow; today?: boolean }) {
  return (
    <li className={styles.row} data-today={today || undefined}>
      <Stitch kind="sewn" />
      <StateMark state="settled" fabric="var(--rosa)" />
      <p className={styles.rowText}>
        <span className={styles.day}>{row.day}</span>
        <span className="visually-hidden">, </span>
        <span className={styles.times}>{row.times}</span>
      </p>
      <p className={styles.pay}>{row.pay}</p>
    </li>
  );
}

export default async function AidePage() {
  const now = new Date();
  const family = await ensureFamily(await getSessionId());
  const week = await getAideWeek(family, now);
  const card = todayCard(week.today, week.parent);
  const summary = weekSummary(week.visits, week.periods, now);

  return (
    <Frame role="rosa">
      <div className={styles.phone}>
        <div className={styles.screen}>
          <header>
            <h1 className={styles.heading}>Today with {week.parent}</h1>
            <p className={styles.date}>{formatDay(now)}</p>
          </header>

          <section className={styles.today} aria-label="Today’s visit" aria-live="polite">
            {card.step === "start" && (
              <div key="start" className={styles.step}>
                <form action={checkIn} className={styles.form}>
                  <StepButton
                    className={styles.here}
                    pending="Checking in…"
                    decor={
                      <>
                        <Stitch kind="light" />
                        <DoorOpen className={styles.hereIcon} aria-hidden="true" />
                      </>
                    }
                  >
                    I&rsquo;m here
                  </StepButton>
                </form>
                <p className={styles.hint}>Tap when you get to {week.parent}&rsquo;s.</p>
              </div>
            )}

            {card.step === "visiting" && (
              <div key="visiting" className={styles.step}>
                <div className={`${styles.visiting} ${styles.arrive}`}>
                  <Stitch kind="light" />
                  <StateMark state="settled" fabric="rgb(255 255 255 / 0.24)" />
                  <div>
                    <p className={styles.visitingTitle}>{card.title}</p>
                    <p className={styles.visitingDetail}>{card.detail}</p>
                  </div>
                </div>
                <form action={checkOut} className={styles.form}>
                  <StepButton className={styles.done} pending="Saving…" decor={<Stitch kind="light" />}>
                    Visit done
                  </StepButton>
                </form>
              </div>
            )}

            {card.step === "done" && (
              <ul key="done" className={`${styles.rows} ${styles.arrive}`}>
                <SettledRow row={card.row} today />
              </ul>
            )}
          </section>

          <section className={styles.week} aria-labelledby="week-heading">
            {week.earlier.length > 0 ? (
              <>
                <h2 id="week-heading" className={styles.subheading}>
                  Earlier this week
                </h2>
                <ul className={styles.rows}>
                  {week.earlier.map((visit) => (
                    <SettledRow key={visit.id} row={visitRow(visit)} />
                  ))}
                </ul>
              </>
            ) : (
              <h2 id="week-heading" className="visually-hidden">
                This week
              </h2>
            )}

            <div className={styles.summary}>
              <p className={styles.total}>
                <span>This week · {summary.count}</span>
                {summary.totalCents > 0 && <strong>{summary.total}</strong>}
              </p>
              <ul className={styles.payLines}>
                {summary.pay.map((line) => {
                  const Icon = line.settled ? CircleCheck : CalendarClock;
                  return (
                    <li key={line.text} className={styles.payLine} data-settled={line.settled || undefined}>
                      <Icon className={styles.payIcon} aria-hidden="true" />
                      {line.text}
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </Frame>
  );
}
