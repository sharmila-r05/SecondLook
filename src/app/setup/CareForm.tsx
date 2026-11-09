"use client";

import { type CSSProperties, type FormEvent, useActionState, useState } from "react";
import { formatUsd, splitCents, toAmount } from "@/lib/money";
import { CHOICES, dollarsToCents, VISIT_RATE_RANGE } from "@/lib/settings";
import { saveCareStep, type StepState } from "./actions";
import { ChoiceGroup, MoneyInput, SubmitRow } from "./fields";
import styles from "./setup.module.css";
import { Thread } from "./Thread";

const whole = (cents: number) => formatUsd(cents).replace(/\.00$/, "");

/** Sarah's share first, from all of it to none, so the even split sits in the middle of the row. */
const SHARES = [...CHOICES.sarahShare].sort((a, b) => b - a);

/** One visit's pay split as care.ts splits a week: whole cents, the leftover cent to Sarah (hard rule 5). */
function perVisit(rateCents: number | null, sarahShare: number): { sarah: number; tom: number } | null {
  if (rateCents === null || rateCents < VISIT_RATE_RANGE.minCents || rateCents > VISIT_RATE_RANGE.maxCents) return null;
  const cents = splitCents(rateCents, { sarah: sarahShare, tom: 100 - sarahShare }, "sarah");
  return { sarah: cents.sarah ?? 0, tom: cents.tom ?? 0 };
}

/** Step 3: Rosa's pay per visit and how Sarah and Tom split it. Saving it sets the family up. */
export function CareForm({
  initialRateCents,
  initialSarahShare,
  organizer,
  back,
}: {
  initialRateCents: number;
  initialSarahShare: number;
  organizer: "Sarah" | "Tom";
  back: { href: string; label: string };
}) {
  const [state, action, pending] = useActionState<StepState, FormData>(saveCareStep, {});
  const [rate, setRate] = useState(toAmount(initialRateCents));
  const [share, setShare] = useState(initialSarahShare);
  const sibling = organizer === "Sarah" ? "Tom" : "Sarah";
  const [rateWrong, setRateWrong] = useState(false);
  const amounts = perVisit(dollarsToCents(rate), share);
  const range = `${whole(VISIT_RATE_RANGE.minCents)} to ${whole(VISIT_RATE_RANGE.maxCents)}`;

  // Caught here first with an example; the server checks again and its error shows if this misses.
  const outOfRange = (text: string) => {
    const cents = dollarsToCents(text);
    return cents === null || cents < VISIT_RATE_RANGE.minCents || cents > VISIT_RATE_RANGE.maxCents;
  };

  function check(event: FormEvent<HTMLFormElement>) {
    const wrong = outOfRange(rate);
    setRateWrong(wrong);
    if (wrong) {
      event.preventDefault();
      document.getElementById("visit-rate")?.focus();
    }
  }
  const parts = [
    { name: "Sarah", fabric: "sarah", percent: share, cents: amounts?.sarah },
    { name: "Tom", fabric: "tom", percent: 100 - share, cents: amounts?.tom },
  ].filter((p) => p.percent > 0);

  return (
    <form action={action} onSubmit={check} className={styles.form} noValidate>
      <div className={styles.section}>
        <div className={styles.moneyField}>
          <label htmlFor="visit-rate" className={styles.legend}>
            Rosa&rsquo;s pay per visit
          </label>
          <p id="visit-rate-help" className={styles.help}>
            Anything from {range}. It applies from her next visit.
          </p>
          <MoneyInput
            id="visit-rate"
            name="visitRate"
            value={rate}
            onChange={(value) => {
              setRate(value);
              // Once flagged, the message goes as soon as the amount is right.
              if (rateWrong && !outOfRange(value)) setRateWrong(false);
            }}
            describedBy="visit-rate-help"
            invalid={rateWrong}
          />
        </div>

        <ChoiceGroup
          name="sarahShare"
          legend={`How you and ${sibling} split it`}
          help="Sarah’s part first, then Tom’s, in percent."
          choices={SHARES.map((s) => ({
            value: s,
            name: `Sarah ${s}%, Tom ${100 - s}%`,
            label: (
              <span className={styles.share} style={{ "--sarah-share": `${s}%` } as CSSProperties}>
                <span className={styles.shareRatio}>
                  {s} / {100 - s}
                </span>
                <span className={styles.shareBar} aria-hidden="true" />
              </span>
            ),
          }))}
          value={share}
          onChange={setShare}
          optionClass={styles.splitOption}
          listClass={styles.splitPills}
        >
          <div className={styles.split} aria-live="polite">
            {parts.map((p) => (
              <p key={p.name} className={`${styles.splitPart} ${styles.fabric}`} data-fabric={p.fabric} style={{ flexGrow: p.percent }}>
                <Thread />
                <span className={styles.splitWho}>
                  {p.name === organizer ? "You" : p.name} · {p.percent}%
                </span>
                <span>{p.cents !== undefined ? `${formatUsd(p.cents)} a visit` : "of each visit"}</span>
              </p>
            ))}
          </div>
        </ChoiceGroup>
      </div>

      <SubmitRow
        pending={pending}
        label="Save and finish"
        pendingLabel="Setting up the family…"
        error={rateWrong ? `Rosa’s pay should be in dollars, from ${range}, like 50.00` : state.error}
        back={back}
        note={`Saving this sets the family up. Then you’ll invite Mom, ${sibling} and Rosa.`}
      />
    </form>
  );
}
