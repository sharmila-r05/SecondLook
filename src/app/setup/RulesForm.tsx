"use client";

import { Info } from "lucide-react";
import { useActionState, useState } from "react";
import { formatUsd } from "@/lib/money";
import { CHOICES, holdWords, type Rules } from "@/lib/settings";
import { saveRulesStep, type StepState } from "./actions";
import { ChoiceGroup, SubmitRow } from "./fields";
import styles from "./setup.module.css";

const whole = (cents: number) => formatUsd(cents).replace(/\.00$/, "");
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// The same chips Sarah and Tom see on a held payment, so the words they're shown here are the ones they'll meet.
const ALWAYS = ["Tech-support story", "Gift cards", "Crypto or wire", "Government threat", "Family emergency", "Asked to keep it secret", "Urgent wording"];

/** Step 2: what sends Mom's payment for a second look, who is asked, and how long it waits. */
export function RulesForm({ initial, sibling, back }: { initial: Rules; sibling: string; back: { href: string; label: string } }) {
  const [state, action, pending] = useActionState<StepState, FormData>(saveRulesStep, {});
  const [limit, setLimit] = useState(initial.limitCents);
  const [daily, setDaily] = useState(initial.dailyLimitCents);
  const [multiple, setMultiple] = useState(initial.unusualMultiple);
  const [hold, setHold] = useState(initial.holdMinutes);
  const [ask, setAsk] = useState<Rules["ask"]>(initial.ask);

  return (
    <form action={action} className={styles.form}>
      <div className={styles.section}>
        <ChoiceGroup
          name="limitCents"
          legend="One payment over"
          help="Any single payment above this, to anyone, even a bill she pays every month."
          choices={CHOICES.limitCents.map((c) => ({ value: c, label: whole(c) }))}
          value={limit}
          onChange={setLimit}
        />

        <ChoiceGroup
          name="dailyLimitCents"
          legend="Payments in one day over"
          help="When everything Mom pays in a day adds up to more than this."
          choices={CHOICES.dailyLimitCents.map((c) => ({ value: c, label: whole(c) }))}
          value={daily}
          onChange={setDaily}
        >
          {daily < limit && (
            <p className={styles.warning} role="status">
              <Info aria-hidden="true" />
              <span>This is below the limit for one payment. Pick {whole(limit)} or more.</span>
            </p>
          )}
        </ChoiceGroup>

        <ChoiceGroup
          name="unusualMultiple"
          legend="A regular bill far above its usual"
          help="When a bill Mom pays every month comes in at this many times its usual amount."
          choices={CHOICES.unusualMultiple.map((c) => ({ value: c, label: `${c} times` }))}
          value={multiple}
          onChange={setMultiple}
        />

        <div className={styles.group}>
          <h2 className={styles.legend}>Always, at any amount</h2>
          <p className={styles.help}>
            Anyone Mom hasn&rsquo;t paid before, and anything she says that sounds like a scam: a gift card, the IRS, &ldquo;don&rsquo;t tell
            anyone&rdquo;. These can&rsquo;t be switched off.
          </p>
          <ul className={styles.chips} aria-label="Words that always get a second look">
            {ALWAYS.map((chip) => (
              <li key={chip} className={styles.chip}>
                {chip}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.subheading}>When a payment is held</h2>

        <ChoiceGroup
          name="ask"
          legend="Who gets asked"
          rows
          choices={[
            { value: "everyone" as const, label: `${sibling} and me`, detail: "You both get the alert. Whoever answers first decides." },
            { value: "organizer" as const, label: "Just me", detail: `Only you are asked. ${sibling} still sees every decision.` },
          ]}
          value={ask}
          onChange={setAsk}
        />

        <ChoiceGroup
          name="holdMinutes"
          legend="If nobody answers, cancel it after"
          help="Cancelled means nothing is paid: the money never leaves Mom’s PayPal. 10 minutes suits trying the demo."
          choices={CHOICES.holdMinutes.map((m) => ({ value: m, label: capital(holdWords(m)) }))}
          value={hold}
          onChange={setHold}
        />
      </div>

      <SubmitRow pending={pending} label="Save and continue" pendingLabel="Saving…" error={state.error} back={back} />
    </form>
  );
}
