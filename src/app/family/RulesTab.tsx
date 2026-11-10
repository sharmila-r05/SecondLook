import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { StateMark } from "@/components/quilt/StateMark";
import { Stitch } from "@/components/quilt/Stitch";
import { getAccount } from "@/lib/account";
import type { Account } from "@/lib/auth";
import { type Family, memberNamed, organizerOf } from "@/lib/family";
import { type BillRow, getBillChoices } from "@/lib/setup-view";
import { savedPayPal } from "@/lib/vault";
import { ALWAYS_WORDS, RULES_COPY } from "@/lib/copy/rules";
import { peopleRows } from "./rules-copy";
import { BillsForm, CareForm, RulesForm } from "./RulesForms";
import styles from "./family.module.css";
import r from "./rules.module.css";

type Viewer = "sarah" | "tom";

export interface RulesData {
  bills: BillRow[];
  paypalConnected: boolean;
  account: Account | null;
}

/** What the Rules tab reads besides the family itself. */
export async function loadRules(family: Family): Promise<RulesData> {
  const [bills, paypal, account] = await Promise.all([getBillChoices(family), savedPayPal(family), getAccount()]);
  return { bills, paypalConnected: paypal !== null, account };
}

const nameOf = (as: Viewer) => (as === "tom" ? "Tom" : "Sarah");

/**
 * The family's own rules, in the order they matter: what sends Mom's payment for a second look (the limit first),
 * Mom's regular bills, then care costs. Sarah or Tom can change any of it; a change applies from Mom's next payment.
 * Who is in the family follows in the column, or sits beside it on a wide desktop (FamilyCard).
 */
export function RulesTab({ family, as, data }: { family: Family; as: Viewer; data: RulesData }) {
  const { settings } = family;
  const viewer = nameOf(as);
  const organizer = organizerOf(family)?.name ?? "Sarah";
  const aide = memberNamed(family, "aide") ?? "The aide";
  const sarahId = family.members.find((m) => m.name === "Sarah")?.id;

  return (
    <>
      <h1 className={styles.heading}>Rules</h1>
      <p className={styles.explain}>What sends Mom&rsquo;s payments to family first, and what care costs. Sarah or Tom can change them.</p>

      <section className={`${styles.card} ${r.section}`} aria-labelledby="rules-second-look">
        <Stitch kind="sewn" />
        <h2 id="rules-second-look" className={styles.cardTitle}>
          What gets a second look
        </h2>
        <RulesForm
          as={as}
          values={{
            limitCents: settings.limitCents,
            dailyLimitCents: settings.dailyLimitCents,
            unusualMultiple: settings.unusualMultiple,
            holdMinutes: settings.holdMinutes,
            ask: settings.ask,
          }}
          organizer={organizer}
          sibling={organizer === "Tom" ? "Sarah" : "Tom"}
        >
          <div className={r.always}>
            <p className={r.label}>{RULES_COPY.always.label}</p>
            <p className={r.hint}>{RULES_COPY.always.help}</p>
            <ul className={styles.chips} aria-label={RULES_COPY.always.chips}>
              {ALWAYS_WORDS.map((w) => (
                <li key={w.chip} className={styles.chip} title={`Like “${w.example}”`}>
                  {w.chip}
                </li>
              ))}
            </ul>
          </div>
        </RulesForm>
      </section>

      <section className={`${styles.card} ${r.section}`} aria-labelledby="rules-bills">
        <Stitch kind="sewn" />
        <div>
          <h2 id="rules-bills" className={styles.cardTitle}>
            Mom&rsquo;s bills
          </h2>
          <p className={styles.when}>She pays these on her own, unless a rule above sends one to you.</p>
        </div>
        <BillsForm as={as} bills={data.bills} />
      </section>

      <section className={`${styles.card} ${r.section}`} aria-labelledby="rules-care">
        <Stitch kind="sewn" />
        <div>
          <h2 id="rules-care" className={styles.cardTitle}>
            Care costs
          </h2>
          <p className={styles.when}>
            {aide} is paid by PayPal when a week is closed. You and {viewer === "Tom" ? "Sarah" : "Tom"} are each invoiced for your share.
          </p>
        </div>
        <CareForm as={as} aide={aide} visitRateCents={settings.visitRateCents} sarahShare={sarahId ? (settings.split[sarahId] ?? 50) : 50} />
      </section>

      <FamilyCard family={family} as={as} data={data} placement="column" />
    </>
  );
}

/**
 * Who is in the family and where each person is (Mom's yes and her PayPal, who opened their invite), how to invite
 * them, and signing out. At the foot of the column on a phone; beside it on a wide desktop, like the phone QR code.
 */
export function FamilyCard({ family, as, data, placement }: { family: Family; as: Viewer; data: RulesData; placement: "column" | "side" }) {
  const { settings } = family;
  const viewer = nameOf(as);
  const organizer = organizerOf(family)?.name ?? "Sarah";
  const people = peopleRows({
    members: family.members,
    organizerId: settings.organizerId,
    origin: settings.origin,
    viewer,
    parentAgreed: settings.parentAgreedAt !== null,
    paypalConnected: data.paypalConnected,
  });
  const headingId = `rules-family-${placement}`;

  return (
    <div className={placement === "side" ? r.familySide : r.familyColumn}>
      <section className={`${styles.card} ${r.section}`} aria-labelledby={headingId}>
        <Stitch kind="sewn" />
        <h2 id={headingId} className={styles.cardTitle}>
          The family
        </h2>
        <ul className={r.people}>
          {people.map((p) => (
            <li key={p.id} className={r.person} data-steps={p.steps ? true : undefined}>
              <StateMark state={p.done ? "settled" : "processing"} fabric={p.fabric} />
              <div>
                <p className={r.personName}>
                  {p.name} <span className={r.relation}>· {p.relation}</span>
                </p>
                {p.steps ? (
                  <ul className={r.steps}>
                    {p.steps.map((step) => (
                      <li key={step.text} className={r.step} data-done={step.done || undefined}>
                        <StateMark state={step.done ? "settled" : "processing"} fabric={p.fabric} />
                        <span>{step.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={r.hint}>{p.status}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
        {settings.origin === "setup" ? (
          organizer === viewer ? (
            <Link href="/setup?step=devices" className={r.inviteLink}>
              Invite or re-send links
              <ArrowRight className={r.linkIcon} aria-hidden="true" />
            </Link>
          ) : (
            <p className={r.demoNote}>{organizer} set the family up and can re-send anyone&rsquo;s invite.</p>
          )
        ) : (
          <p className={r.demoNote}>
            This is the demo&rsquo;s ready-made family. To see how a family is set up, choose &ldquo;Set up your family&rdquo; on the{" "}
            <Link href="/" className={styles.textLink}>
              welcome page
            </Link>
            .
          </p>
        )}
      </section>

      {data.account && (
        <form action="/signout" method="post" className={r.signOut}>
          <p className={r.hint}>Signed in on this device{data.account.person ? ` as ${data.account.person}` : ""}.</p>
          <button type="submit" className={r.signOutButton}>
            Sign out
          </button>
        </form>
      )}
    </div>
  );
}
