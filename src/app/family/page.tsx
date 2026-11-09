import {
  Banknote,
  CalendarClock,
  CircleDollarSign,
  HeartHandshake,
  MessageSquareText,
  Timer,
  TrendingUp,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { FamilyAlerts } from "@/components/push/FamilyAlerts";
import { LiveRefresh } from "@/components/push/LiveRefresh";
import { Frame } from "@/components/quilt/Frame";
import { StateMark } from "@/components/quilt/StateMark";
import { Stitch } from "@/components/quilt/Stitch";
import { sweepExpiredHolds } from "@/lib/bills";
import { getCare, refreshCare } from "@/lib/care";
import { cancelsAt, familyCard, type SecondLook } from "@/lib/copy/family";
import { ensureFamily, getSecondLooks } from "@/lib/family";
import type { RuleId } from "@/lib/risk";
import { getSessionId } from "@/lib/session";
import { decide } from "./actions";
import { CareNeedsCard, CareTab } from "./CareCards";
import styles from "./family.module.css";

export const dynamic = "force-dynamic";

const RULE_ICONS: Record<RuleId, LucideIcon> = {
  new_payee: UserPlus,
  over_limit: Banknote,
  unusual_amount: TrendingUp,
  scam_wording: MessageSquareText,
  urgency: Timer,
  daily_total: CalendarClock,
};

type Tab = "needs" | "money" | "care";

function SecondLookCard({ item, as }: { item: SecondLook; as: "sarah" | "tom" }) {
  const card = familyCard(item);
  const stitch = card.tone === "waiting" ? "basting" : card.tone === "released" ? "pulled" : "sewn";
  const mark = card.tone === "waiting" ? "waiting" : card.tone === "released" ? "declined" : "settled";
  return (
    <article className={styles.card} data-tone={card.tone} aria-labelledby={`look-${item.id}`}>
      <Stitch kind={stitch} />
      <div className={styles.cardHead}>
        <StateMark state={mark} />
        <div>
          <h2 id={`look-${item.id}`} className={styles.cardTitle}>
            {card.title}
          </h2>
          <p className={styles.when}>{card.open ? `${card.when} · held, not taken` : card.when}</p>
        </div>
      </div>

      {card.open ? (
        <>
          {item.note && <p className={styles.note}>{item.note}</p>}
          <ul className={styles.chips} aria-label="Why it was held">
            {item.rules.map((rule) => {
              const Icon = RULE_ICONS[rule.id];
              return (
                <li key={`${rule.id}-${rule.chip}`} className={styles.chip} title={rule.fact}>
                  <Icon className={styles.chipIcon} aria-hidden="true" />
                  {rule.chip}
                </li>
              );
            })}
          </ul>
          <form action={decide} className={styles.decide}>
            <input type="hidden" name="request" value={item.id} />
            {as === "tom" && <input type="hidden" name="as" value="tom" />}
            <button type="submit" name="decision" value="deny" className={styles.deny}>
              Deny and cancel
            </button>
            <button type="submit" name="decision" value="approve" className={styles.approve}>
              Approve and pay
            </button>
          </form>
          <p className={styles.expires}>{cancelsAt(item)}</p>
        </>
      ) : (
        card.outcome && <p className={styles.outcome}>{card.outcome}</p>
      )}
    </article>
  );
}

export default async function FamilyPage({ searchParams }: { searchParams: Promise<{ as?: string; tab?: string }> }) {
  const params = await searchParams;
  const as = params.as === "tom" ? "tom" : "sarah";
  const tab: Tab = params.tab === "money" || params.tab === "care" ? params.tab : "needs";
  const sessionId = await getSessionId();
  const family = await ensureFamily(sessionId);
  await sweepExpiredHolds(family, sessionId);
  await refreshCare(family, sessionId);
  const [looks, care] = await Promise.all([getSecondLooks(family), getCare(family)]);
  const waiting = looks.filter((l) => l.status === "held");
  const decided = looks.filter((l) => l.status !== "held");
  const href = (t: Tab) => {
    const q = new URLSearchParams();
    if (as === "tom") q.set("as", "tom");
    if (t !== "needs") q.set("tab", t);
    const s = q.toString();
    return s ? `/family?${s}` : "/family";
  };

  return (
    <Frame role={as}>
      <LiveRefresh />
      <div className={styles.phone}>
        <div className={styles.screen}>
          {tab === "needs" && (
            <>
              <h1 className={styles.heading}>Needs you</h1>
              {waiting.length === 0 ? (
                <p className={styles.empty}>Nothing needs you right now. Mom&rsquo;s bills are going through on their own.</p>
              ) : (
                waiting.map((item) => <SecondLookCard key={item.id} item={item} as={as} />)
              )}
              <FamilyAlerts as={as} />

              <CareNeedsCard care={care} as={as} careHref={href("care")} />

              {decided.length > 0 && (
                <>
                  <h2 className={styles.subheading}>Decided this week</h2>
                  {decided.map((item) => (
                    <SecondLookCard key={item.id} item={item} as={as} />
                  ))}
                </>
              )}
            </>
          )}

          {tab === "money" && (
            <>
              <h1 className={styles.heading}>Money</h1>
              <p className={styles.empty}>
                Every payment and who moved it is in the <Link href="/ledger">shared ledger</Link>.
              </p>
            </>
          )}

          {tab === "care" && <CareTab care={care} as={as} />}
        </div>

        <nav className={styles.tabbar} aria-label="Family">
          <Link href={href("needs")} className={styles.tab} aria-current={tab === "needs" ? "page" : undefined}>
            <span className={styles.tabIcon}>
              <Users aria-hidden="true" />
              {waiting.length > 0 && <span className={styles.badge}>{waiting.length}</span>}
            </span>
            Needs you
          </Link>
          <Link href={href("money")} className={styles.tab} aria-current={tab === "money" ? "page" : undefined}>
            <CircleDollarSign className={styles.tabIcon} aria-hidden="true" />
            Money
          </Link>
          <Link href={href("care")} className={styles.tab} aria-current={tab === "care" ? "page" : undefined}>
            <HeartHandshake className={styles.tabIcon} aria-hidden="true" />
            Care
          </Link>
        </nav>
      </div>
    </Frame>
  );
}
