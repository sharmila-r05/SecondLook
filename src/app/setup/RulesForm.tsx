"use client";

import { Info } from "lucide-react";
import { useActionState, useState } from "react";
import { ALWAYS_WORDS, askChoices, dollars, RULES_COPY, timesWords, waitWords } from "@/lib/copy/rules";
import { CHOICES, type Rules } from "@/lib/settings";
import { saveRulesStep, type StepState } from "./actions";
import { ChoiceGroup, SubmitRow } from "./fields";
import styles from "./setup.module.css";

/** Step 2: what sends Mom's payment for a second look, who is asked, and how long it waits. */
export function RulesForm({
  initial,
  organizer,
  sibling,
  back,
}: {
  initial: Rules;
  organizer: string;
  sibling: string;
  back: { href: string; label: string };
}) {
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
          legend={RULES_COPY.limit.label}
          help={RULES_COPY.limit.help}
          choices={CHOICES.limitCents.map((c) => ({ value: c, label: dollars(c) }))}
          value={limit}
          onChange={setLimit}
        />

        <ChoiceGroup
          name="dailyLimitCents"
          legend={RULES_COPY.daily.label}
          help={RULES_COPY.daily.help}
          choices={CHOICES.dailyLimitCents.map((c) => ({ value: c, label: dollars(c) }))}
          value={daily}
          onChange={setDaily}
        >
          {daily < limit && (
            <p className={styles.warning} role="status">
              <Info aria-hidden="true" />
              <span>This is below the limit for one payment. Pick {dollars(limit)} or more.</span>
            </p>
          )}
        </ChoiceGroup>

        <ChoiceGroup
          name="unusualMultiple"
          legend={RULES_COPY.unusual.label}
          help={RULES_COPY.unusual.help}
          choices={CHOICES.unusualMultiple.map((c) => ({ value: c, label: timesWords(c) }))}
          value={multiple}
          onChange={setMultiple}
        />

        <div className={styles.group}>
          <h2 className={styles.legend}>{RULES_COPY.always.label}</h2>
          <p className={styles.help}>{RULES_COPY.always.help}</p>
          <ul className={styles.chips} aria-label={RULES_COPY.always.chips}>
            {ALWAYS_WORDS.map((w) => (
              <li key={w.chip} className={styles.chip}>
                {w.chip}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.subheading}>When a payment is held</h2>

        <ChoiceGroup
          name="ask"
          legend={RULES_COPY.ask.label}
          rows
          choices={askChoices({ viewer: organizer, organizer, sibling })}
          value={ask}
          onChange={setAsk}
        />

        <ChoiceGroup
          name="holdMinutes"
          legend={RULES_COPY.hold.label}
          help={`${RULES_COPY.hold.help} 10 minutes suits trying the demo.`}
          choices={CHOICES.holdMinutes.map((m) => ({ value: m, label: waitWords(m) }))}
          value={hold}
          onChange={setHold}
        />
      </div>

      <SubmitRow pending={pending} label="Save and continue" pendingLabel="Saving…" error={state.error} back={back} />
    </form>
  );
}
