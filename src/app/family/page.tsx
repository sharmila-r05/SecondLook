import { CircleDollarSign, HeartHandshake, SlidersHorizontal, Users } from "lucide-react";
import Link from "next/link";
import { after } from "next/server";
import { FamilyAlerts } from "@/components/push/FamilyAlerts";
import { LiveRefresh } from "@/components/push/LiveRefresh";
import { Frame } from "@/components/quilt/Frame";
import { StateMark } from "@/components/quilt/StateMark";
import { Stitch } from "@/components/quilt/Stitch";
import { sweepExpiredHolds, sweepOtherExpiredHolds } from "@/lib/bills";
import { getCare, refreshCare } from "@/lib/care";
import { cancelsAt, familyCard, type SecondLook } from "@/lib/copy/family";
import { ensureFamily, getSecondLooks } from "@/lib/family";
import { getSessionId } from "@/lib/session";
import { requireSetUp } from "@/lib/setup-gate";
import { decide } from "./actions";
import { WeekQuilt } from "@/components/ledger/WeekQuilt";
import { buildLedger } from "@/lib/ledger";
import { getLedgerInput } from "@/lib/ledger-data";
import { CareNeedsCard, CareTab } from "./CareCards";
import { DecideButtons } from "./DecideButtons";
import { PhoneQr, phoneQrCode } from "./PhoneQr";
import { FamilyCard, loadRules, RulesTab } from "./RulesTab";
import styles from "./family.module.css";

export const dynamic = "force-dynamic";

type Tab = "needs" | "money" | "care" | "rules";
const OTHER_TABS: readonly Tab[] = ["money", "care", "rules"];

/** How long a decided payment stays where it was decided, so the card changes in place instead of jumping away. */
const RECENT_MS = 15 * 60_000;

/**
 * "Needs you" lists what waits plus what was decided in the last few minutes, in the order the payments came in, so a
 * card keeps its place when Sarah or Tom decides it. Older decisions go under "Decided this week".
 */
function splitLooks(looks: SecondLook[]): { now: SecondLook[]; earlier: SecondLook[] } {
  const since = Date.now() - RECENT_MS;
  const isNow = (l: SecondLook) => l.status === "held" || l.decidedAt.getTime() > since;
  return {
    now: looks.filter(isNow).sort((a, b) => b.at.getTime() - a.at.getTime()),
    earlier: looks.filter((l) => !isNow(l)),
  };
}

function SecondLookCard({ item, as, recent = false }: { item: SecondLook; as: "sarah" | "tom"; recent?: boolean }) {
  const card = familyCard(item);
  const stitch = card.tone === "waiting" ? "basting" : card.tone === "released" ? "pulled" : "sewn";
  const mark = card.tone === "waiting" ? "waiting" : card.tone === "released" ? "declined" : "settled";
  // An approval is filled in the fabric of whoever gave it, as their actions are everywhere else.
  const fabric = item.decidedBy === "Tom" ? "var(--tom)" : item.decidedBy === "Sarah" ? "var(--sarah)" : undefined;
  return (
    <article className={styles.card} data-tone={card.tone} data-recent={recent || undefined} aria-labelledby={`look-${item.id}`}>
      <Stitch kind={stitch} />
      <div className={styles.cardHead}>
        <StateMark state={mark} fabric={fabric} />
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
            {item.rules.map((rule) => (
              <li key={`${rule.id}-${rule.chip}`} className={styles.chip} title={rule.fact}>
                {rule.chip}
              </li>
            ))}
          </ul>
          <form action={decide} className={styles.decide}>
            <input type="hidden" name="request" value={item.id} />
            {as === "tom" && <input type="hidden" name="as" value="tom" />}
            <DecideButtons denyClass={styles.deny} approveClass={styles.approve} />
          </form>
          <p className={styles.expires}>{cancelsAt(item)}</p>
        </>
      ) : (
        card.outcome && <p className={styles.outcome}>{card.outcome}</p>
      )}
    </article>
  );
}

export default async function FamilyPage({ searchParams }: { searchParams: Promise<{ as?: string; tab?: string; join?: string }> }) {
  const params = await searchParams;
  const as = params.as === "tom" ? "tom" : "sarah";
  const tab: Tab = OTHER_TABS.find((t) => t === params.tab) ?? "needs";
  const sessionId = await getSessionId();
  const family = await ensureFamily(sessionId);
  requireSetUp(family);
  await sweepExpiredHolds(family, sessionId);
  after(() => sweepOtherExpiredHolds());
  await refreshCare(family, sessionId);
  const [looks, care, ledger, qr, rules] = await Promise.all([
    getSecondLooks(family),
    getCare(family),
    tab === "money" ? getLedgerInput(family).then((input) => buildLedger(input)) : null,
    tab === "needs" ? phoneQrCode(sessionId, as) : null,
    tab === "rules" ? loadRules(family) : null,
  ]);
  const waiting = looks.filter((l) => l.status === "held");
  const { now, earlier } = splitLooks(looks);
  const href = (t: Tab) => {
    const q = new URLSearchParams();
    if (as === "tom") q.set("as", "tom");
    if (t !== "needs") q.set("tab", t);
    const s = q.toString();
    return s ? `/family?${s}` : "/family";
  };

  // While a payment waits, the decision comes first and the alerts control waits below the care card. Keyed, so the
  // control keeps its state when it moves.
  const alerts = <FamilyAlerts key="alerts" as={as} />;
  const careCard = <CareNeedsCard key="care" care={care} as={as} careHref={href("care")} />;

  return (
    <Frame role={as}>
      <LiveRefresh />
      <div className={styles.stage}>
        <div className={styles.phone}>
          <div className={styles.screen}>
            {tab === "needs" && (
              <>
                <h1 className={styles.heading}>Needs you</h1>
                {params.join === "expired" && (
                  <p className={styles.explain} role="status">
                    That code had expired, so this phone has its own demo family. Scan the code on the computer again to join.
                  </p>
                )}
                {now.length === 0 && <p className={styles.empty}>Nothing needs you right now. Mom&rsquo;s bills are going through on their own.</p>}
                {now.map((item) => (
                  <SecondLookCard key={item.id} item={item} as={as} recent={item.status !== "held"} />
                ))}
                {now.length > 0 && waiting.length === 0 && <p className={styles.empty}>Nothing else needs you right now.</p>}

                {waiting.length > 0 ? [careCard, alerts] : [alerts, careCard]}

                {earlier.length > 0 && (
                  <>
                    <h2 className={styles.subheading}>Decided this week</h2>
                    {earlier.map((item) => (
                      <SecondLookCard key={item.id} item={item} as={as} />
                    ))}
                  </>
                )}
                {qr && <PhoneQr qr={qr} placement="column" />}
              </>
            )}

            {tab === "money" && (
              <>
                <h1 className={styles.heading}>Money</h1>
                <p className={styles.explain}>
                  Every money move this week, in the colour of whoever set it going. Tap a block to see the PayPal steps behind it, or open the{" "}
                  <Link href="/ledger" className={styles.textLink}>
                    full ledger
                  </Link>
                  .
                </p>
                {ledger && <WeekQuilt weeks={ledger.weeks} initialSelected={ledger.selected} />}
              </>
            )}

            {tab === "care" && <CareTab care={care} as={as} />}

            {rules && <RulesTab family={family} as={as} data={rules} />}
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
            <Link href={href("rules")} className={styles.tab} aria-current={tab === "rules" ? "page" : undefined}>
              <SlidersHorizontal className={styles.tabIcon} aria-hidden="true" />
              Rules
            </Link>
          </nav>
        </div>
        {qr && <PhoneQr qr={qr} placement="side" />}
        {rules && <FamilyCard family={family} as={as} data={rules} placement="side" />}
      </div>
    </Frame>
  );
}
