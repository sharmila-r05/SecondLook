import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { StateMark } from "@/components/quilt/StateMark";
import { Stitch } from "@/components/quilt/Stitch";
import { type CareView, type ClosedPeriod, periodSpan, type ShareView } from "@/lib/care";
import { formatUsd } from "@/lib/money";
import { formatTime } from "@/lib/time";
import { closeCareWeek } from "./actions";
import styles from "./family.module.css";

type Viewer = "sarah" | "tom";

const DAY = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
const day = (ymd: string) => DAY.format(new Date(`${ymd}T12:00:00Z`));
const span = (p: Pick<ClosedPeriod, "startDate" | "endDate">) => periodSpan(p.startDate, p.endDate);
const times = (n: number) => `${n} ${n === 1 ? "time" : "times"}`;
const visitCount = (n: number) => `${n} ${n === 1 ? "visit" : "visits"}`;
const viewerName = (as: Viewer) => (as === "tom" ? "Tom" : "Sarah");

function payoutLabel(status: string | null): string {
  if (status === "SUCCESS") return "Paid by PayPal";
  if (status === "PENDING" || status === "PROCESSING" || status === "paying") return "On its way by PayPal";
  return status ? `PayPal: ${status.toLowerCase()}` : "Not sent yet";
}

function CloseForm({ as, label, className }: { as: Viewer; label: string; className: string | undefined }) {
  return (
    <form action={closeCareWeek}>
      {as === "tom" && <input type="hidden" name="as" value="tom" />}
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}

function PayLink({ share }: { share: ShareView }) {
  if (!share.payUrl) return null;
  return (
    <a href={share.payUrl} target="_blank" rel="noopener noreferrer" className={styles.payLink}>
      Pay {formatUsd(share.amountCents)} on PayPal
      <ExternalLink className={styles.payIcon} aria-hidden="true" />
      <span className="visually-hidden"> (opens PayPal in a new tab)</span>
    </a>
  );
}

/** The care card on "Needs you": ready to close, your share to pay, or settled. */
export function CareNeedsCard({ care, as, careHref }: { care: CareView; as: Viewer; careHref: string }) {
  const me = viewerName(as);
  const myShare = care.last?.shares.find((s) => s.name === me && s.status === "sent");
  const { open } = care;

  if (open.visits.length > 0) {
    return (
      <article className={`${styles.card} ${styles.care}`} aria-labelledby="care-ready">
        <Stitch kind="sage" />
        <div className={styles.cardHead}>
          <StateMark state="settled" fabric="var(--rosa)" />
          <div>
            <h2 id="care-ready" className={styles.cardTitle}>
              This week&rsquo;s care is ready to close
            </h2>
            <p className={styles.when}>
              <span className={styles.aideName}>{care.aide}</span> came {times(open.visits.length)} ·{" "}
              <span className={styles.amount}>{formatUsd(open.totalCents)}</span>
            </p>
          </div>
        </div>
        <div className={styles.cardActions}>
          <CloseForm as={as} label="Close the week" className={styles.secondary} />
          <Link href={careHref} className={styles.textLink}>
            See the visits
          </Link>
        </div>
      </article>
    );
  }

  if (myShare) {
    return (
      <article className={`${styles.card} ${styles.care}`} aria-labelledby="care-share">
        <Stitch kind="sage" />
        <div className={styles.cardHead}>
          <StateMark state="waiting" thread="var(--rosa)" />
          <div>
            <h2 id="care-share" className={styles.cardTitle}>
              Your share of {care.aide}&rsquo;s week: {formatUsd(myShare.amountCents)}
            </h2>
            <p className={styles.when}>{care.aide} is already paid. This is your half, by PayPal invoice.</p>
          </div>
        </div>
        <PayLink share={myShare} />
      </article>
    );
  }

  return (
    <article className={`${styles.card} ${styles.care}`} aria-labelledby="care-settled">
      <Stitch kind="sewn" />
      <div className={styles.cardHead}>
        <StateMark state="settled" fabric="var(--rosa)" />
        <div>
          <h2 id="care-settled" className={styles.cardTitle}>
            This week&rsquo;s care
          </h2>
          <p className={styles.when}>
            {care.last ? `${care.aide} was paid ${formatUsd(care.last.totalCents)} for ${span(care.last)}.` : `No visits from ${care.aide} yet.`}
          </p>
        </div>
      </div>
      <Link href={careHref} className={styles.textLink}>
        See the week
      </Link>
    </article>
  );
}

/** The Care tab: the visits waiting to be closed, and the last close with Rosa's payout and both invoices. */
export function CareTab({ care, as }: { care: CareView; as: Viewer }) {
  const me = viewerName(as);
  const { open, last } = care;
  return (
    <>
      <h1 className={styles.heading}>Care</h1>

      <article className={`${styles.card} ${styles.care}`} aria-labelledby="care-open">
        <Stitch kind={open.visits.length > 0 ? "sage" : "sewn"} />
        <div className={styles.cardHead}>
          <StateMark state="settled" fabric="var(--rosa)" />
          <div>
            <h2 id="care-open" className={styles.cardTitle}>
              {open.visits.length > 0 ? `${care.aide} came ${times(open.visits.length)}` : `No new visits from ${care.aide}`}
            </h2>
            <p className={styles.when}>{last ? `Since the week of ${span(last)} was closed` : "This week"}</p>
          </div>
        </div>
        {open.visits.length > 0 && (
          <>
            <ul className={styles.rows}>
              {open.visits.map((v) => (
                <li key={v.date} className={styles.row}>
                  <span>{day(v.date)}</span>
                  <span className={styles.amount}>{formatUsd(v.rateCents)}</span>
                </li>
              ))}
              <li className={`${styles.row} ${styles.total}`}>
                <span>{care.aide}&rsquo;s pay</span>
                <span className={styles.amount}>{formatUsd(open.totalCents)}</span>
              </li>
            </ul>
            <p className={styles.explain}>
              Closing pays {care.aide} {formatUsd(open.totalCents)} by PayPal right away, and sends{" "}
              {open.shares.map((s, i) => (
                <span key={s.name}>
                  {i > 0 && (i === open.shares.length - 1 ? " and " : ", ")}
                  {s.name === me ? "you" : s.name} a PayPal invoice for {formatUsd(s.amountCents)}
                </span>
              ))}
              .
            </p>
            <CloseForm as={as} label={`Close the week and pay ${care.aide}`} className={styles.primary} />
          </>
        )}
      </article>

      {last && (
        <>
          <h2 className={styles.subheading}>Last closed</h2>
          <article className={`${styles.card} ${styles.care}`} aria-labelledby="care-last">
            <Stitch kind={last.shares.every((s) => s.status === "paid") && last.payoutStatus === "SUCCESS" ? "sewn" : "sage"} />
            <div className={styles.cardHead}>
              <StateMark state={last.status === "closed" ? "settled" : "processing"} fabric="var(--rosa)" />
              <div>
                <h2 id="care-last" className={styles.cardTitle}>
                  {care.aide}&rsquo;s week of {span(last)}: {formatUsd(last.totalCents)}
                </h2>
                <p className={styles.when}>
                  {visitCount(last.visits)}
                  {last.closedBy ? ` · closed by ${last.closedBy}` : ""}
                  {last.closedAt ? ` at ${formatTime(last.closedAt)}` : ""}
                </p>
              </div>
            </div>
            <ul className={styles.rows}>
              <li className={styles.row}>
                <span>{care.aide}</span>
                <span className={styles.status}>{payoutLabel(last.payoutStatus)}</span>
              </li>
              {last.shares.map((s) => (
                <li key={s.id} className={styles.row}>
                  <span>
                    {s.name === me ? "Your share" : `${s.name}'s share`} · <span className={styles.amount}>{formatUsd(s.amountCents)}</span>
                  </span>
                  <span className={styles.status} data-paid={s.status === "paid" || undefined}>
                    {s.status === "paid" ? "Paid" : s.status === "sent" ? "Invoice sent" : "Sending"}
                  </span>
                </li>
              ))}
            </ul>
            {last.shares
              .filter((s) => s.name === me && s.status === "sent")
              .map((s) => (
                <PayLink key={s.id} share={s} />
              ))}
          </article>
        </>
      )}
    </>
  );
}
