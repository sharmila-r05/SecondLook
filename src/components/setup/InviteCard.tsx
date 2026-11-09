import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { StateMark } from "@/components/quilt/StateMark";
import { INVITE_DAYS } from "@/lib/join";
import type { Person } from "@/lib/session-cookie";
import { formatTime, localDate, PARENT_TIME_ZONE } from "@/lib/time";
import styles from "./InviteCard.module.css";
import { InviteShare } from "./InviteShare";

const FABRIC: Record<Person, string> = { Margaret: "margaret", Sarah: "sarah", Tom: "tom", Rosa: "rosa" };
const FABRIC_VAR: Record<Person, string> = { Margaret: "var(--margaret)", Sarah: "var(--sarah)", Tom: "var(--tom)", Rosa: "var(--rosa)" };

export interface InviteCheck {
  done: boolean;
  text: string;
}

const DAY = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: PARENT_TIME_ZONE });

/** "at 3:42 pm" today, "on Monday" before. */
function when(at: Date, now = new Date()): string {
  return localDate(at) === localDate(now) ? `at ${formatTime(at)}` : `on ${DAY.format(at)}`;
}

/**
 * One person's invite: their name in their fabric, whether their device has opened it, their QR code and their link
 * with Copy and Share. Once they've joined, the code and link fold away under "Send the link again".
 */
export function InviteCard({
  person,
  relation,
  device,
  url,
  qrSvg,
  joinedAt,
  about,
  checks = [],
  message,
  children,
}: {
  person: Person;
  /** Who they are to the organizer: "Mom", "your brother", "Mom’s aide". */
  relation: string;
  device: "tablet" | "phone";
  url: string;
  qrSvg: string;
  joinedAt: Date | null;
  /** One or two plain sentences on what this person does in Second Look. */
  about: ReactNode;
  /** More to know about this person beyond "opened it" (Mom: said yes, connected her PayPal). */
  checks?: InviteCheck[];
  /** What the share sheet or email says above the link. */
  message: string;
  children?: ReactNode;
}) {
  const their = person === "Tom" ? "his" : "her";
  const headingId = `invite-${person.toLowerCase()}`;
  const opened: InviteCheck = joinedAt
    ? { done: true, text: `Opened on ${their} ${device} ${when(joinedAt)}` }
    : { done: false, text: `Not opened on ${their} ${device} yet` };
  const send = (
    <div className={styles.sendBlock}>
      <div className={styles.send}>
        <div className={styles.qr} role="img" aria-label={`QR code that opens ${person}’s link`} dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <InviteShare url={url} name={person} message={message} />
      </div>
      <p className={styles.lasts}>
        The link works for {INVITE_DAYS} days and opens Second Look as {person}.
      </p>
    </div>
  );

  return (
    <article className={styles.card} data-joined={joinedAt ? true : undefined} aria-labelledby={headingId}>
      <header className={styles.band} data-fabric={FABRIC[person]}>
        <svg className={styles.thread} aria-hidden="true" focusable="false">
          <rect x="0" y="0" width="100%" height="100%" rx="8" ry="8" />
        </svg>
        <h2 id={headingId} className={styles.name}>
          {person}
        </h2>
        <p className={styles.relation}>
          {relation.charAt(0).toUpperCase() + relation.slice(1)} · {their} {device}
        </p>
      </header>

      <div className={styles.body}>
        <ul className={styles.checks}>
          {[opened, ...checks].map((check) => (
            <li key={check.text} className={styles.check} data-done={check.done || undefined}>
              <StateMark state={check.done ? "settled" : "processing"} fabric={FABRIC_VAR[person]} />
              <span>{check.text}</span>
            </li>
          ))}
        </ul>
        <p className={styles.about}>{about}</p>
        {joinedAt ? (
          <details className={styles.again}>
            <summary className={styles.summary}>
              Send the link again
              <ChevronDown className={styles.chevron} aria-hidden="true" />
            </summary>
            {send}
          </details>
        ) : (
          send
        )}
        {children}
      </div>
    </article>
  );
}
