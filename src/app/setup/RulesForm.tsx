"use client";

import { Info } from "lucide-react";
import { type FormEvent, startTransition, useActionState, useState } from "react";
import { ALWAYS_WORDS, askChoices, dailyFloor, dollars, lowestDaily, RULES_COPY, timesWords, waitWords } from "@/lib/copy/rules";
import { CHOICES, type Rules } from "@/lib/settings";
import { saveRulesStep, type StepState } from "./actions";
import { ChoiceGroup, FormError, SubmitRow } from "./fields";
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
  const [raised, setRaised] = useState(false);
  const [multiple, setMultiple] = useState(initial.unusualMultiple);
  const [hold, setHold] = useState(initial.holdMinutes);
  const [ask, setAsk] = useState<Rules["ask"]>(initial.ask);

  // A day's limit can't be below one payment's, so it can't be picked that way: raising the one-payment limit past it
  // raises the day's limit to match, and the day's answers below the limit are passed over.
  const chooseLimit = (next: number) => {
    setLimit(next);
    const floor = lowestDaily(next);
    setRaised(daily < floor);
    if (daily < floor) setDaily(floor);
  };
  const someUnavailable = CHOICES.dailyLimitCents.some((c) => c < limit);
  // The server checks the pair again; if it still refuses, its reason sits with the day's limit, not by Save.
  const dailyError = !pending && state.error?.startsWith("The daily limit") ? state.error : undefined;

  // Sent by hand so a refused save leaves every answer as chosen (a plain form action resets the form after it runs,
  // which would put the patches out of step with what's chosen). Without script, the form still posts to the action.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  };

  return (
    <form action={action} onSubmit={submit} className={styles.form}>
      <div className={styles.section}>
        <ChoiceGroup
          name="limitCents"
          legend={RULES_COPY.limit.label}
          help={RULES_COPY.limit.help}
          choices={CHOICES.limitCents.map((c) => ({ value: c, label: dollars(c) }))}
          value={limit}
          onChange={chooseLimit}
        />

        <ChoiceGroup
          name="dailyLimitCents"
          legend={RULES_COPY.daily.label}
          help={RULES_COPY.daily.help}
          choices={CHOICES.dailyLimitCents.map((c) => ({ value: c, label: dollars(c), unavailable: c < limit }))}
          value={daily}
          onChange={(next) => {
            setDaily(next);
            setRaised(false);
          }}
          unavailableNote="daily-floor"
          describedBy={dailyError ? "daily-error" : undefined}
        >
          {someUnavailable && (
            <p id="daily-floor" className={styles.warning}>
              <Info aria-hidden="true" />
              <span>{raised ? `Raised to ${dollars(daily)} to match one payment.` : dailyFloor(limit)}</span>
            </p>
          )}
          <p className="visually-hidden" aria-live="polite">
            {raised ? `${RULES_COPY.daily.label} raised to ${dollars(daily)}, to match one payment.` : ""}
          </p>
          <FormError id="daily-error" error={dailyError} />
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

      <SubmitRow
        pending={pending}
        label="Save and continue"
        pendingLabel="Saving…"
        error={dailyError ? "Nothing was saved yet: the limit for a day needs changing, above" : state.error}
        back={back}
      />
    </form>
  );
}
