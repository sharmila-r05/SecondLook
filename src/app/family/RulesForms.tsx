"use client";

import { type ChangeEvent, type CSSProperties, type FormEvent, type ReactNode, startTransition, useActionState, useState } from "react";
import { FormError } from "@/components/form/FormError";
import { StateMark } from "@/components/quilt/StateMark";
import { askChoices, dailyFloor, dollars, lowestDaily, RATE_AFTER_NAME, RULES_COPY, rateRange, SHARES, shareWords, splitLabel, timesWords, waitWords } from "@/lib/copy/rules";
import { CHOICES, USUAL_AMOUNT_RANGE, VISIT_RATE_RANGE } from "@/lib/settings";
import { amountText, refusal } from "./rules-copy";
import { changeBills, changeCare, changeRules, type RulesState } from "./rules-actions";
import styles from "./family.module.css";
import r from "./rules.module.css";

type Viewer = "sarah" | "tom";
type Action = (prev: RulesState, form: FormData) => Promise<RulesState>;

/**
 * One form's save: pending while the server works, the saved line in place once it's done, cleared again by the next
 * change. Submitted by hand so a refused save keeps what was typed (a plain form action would reset the fields).
 */
function useSave(action: Action) {
  const [state, formAction, pending] = useActionState<RulesState, FormData>(action, {});
  const [changed, setChanged] = useState(false);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setChanged(false);
    startTransition(() => formAction(data));
  };
  return { state, pending, changed, form: { action: formAction, onSubmit, onChange: () => setChanged(true) } };
}

/**
 * The button and what it says beside it: the note before, the saved line after, or why it wasn't saved. Save is solid
 * plum while there is something unsaved (a change, one being saved, or one that was refused), outlined otherwise.
 */
function SaveRow({
  label,
  note,
  save,
  as,
  range,
  errorId,
}: {
  label: string;
  note: string;
  save: ReturnType<typeof useSave>;
  as: Viewer;
  /** The range a typed amount in this form must be in, to say so if one isn't. */
  range?: { minCents: number; maxCents: number };
  /** So a field the refusal is about can point at it. */
  errorId?: string;
}) {
  const { state, pending, changed } = save;
  const refused = Boolean(state.error) && !pending;
  const saved = Boolean(state.saved) && !changed && !pending;
  return (
    <div className={r.saveRow}>
      {refused && state.error && (
        <FormError id={errorId}>
          {refusal(state.error, range)} Nothing was changed.
        </FormError>
      )}
      <div className={r.saveLine}>
        <button type="submit" className={changed || refused || pending ? r.saveReady : r.save} disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Saving…" : label}
        </button>
        <p className={r.saveNote} role="status" data-saved={saved || undefined}>
          {saved && (
            <span className={r.savedMark}>
              <StateMark state="settled" fabric={as === "tom" ? "var(--tom)" : "var(--sarah)"} />
            </span>
          )}
          <span>{saved ? state.saved : note}</span>
        </p>
      </div>
    </div>
  );
}

function Choice<T extends number>({
  name,
  label,
  hint,
  value,
  onChange,
  options,
  words,
  unavailable,
  describedBy,
}: {
  name: string;
  label: string;
  hint?: string;
  value: T;
  /** Given when another field depends on this one's answer: the choice is then held by the form. */
  onChange?: (value: T) => void;
  options: readonly T[];
  words: (v: T) => string;
  /** Answers that can't go with the rest of the form as it stands: shown, dimmed, and not choosable. */
  unavailable?: (v: T) => boolean;
  /** More to read with the choice, such as why a save was refused. */
  describedBy?: string;
}) {
  const id = `rule-${name}`;
  const held = onChange ? { value: String(value), onChange: (e: ChangeEvent<HTMLSelectElement>) => onChange(Number(e.currentTarget.value) as T) } : { defaultValue: String(value) };
  return (
    <div className={r.field}>
      <label htmlFor={id} className={r.label}>
        {label}
      </label>
      <select id={id} name={name} {...held} className={r.select} aria-describedby={[hint ? `${id}-hint` : "", describedBy ?? ""].join(" ").trim() || undefined}>
        {options.map((o) => (
          <option key={o} value={String(o)} disabled={unavailable?.(o)}>
            {words(o)}
          </option>
        ))}
      </select>
      {hint && (
        <p id={`${id}-hint`} className={`${r.hint} ${r.fieldHint}`}>
          {hint}
        </p>
      )}
    </div>
  );
}

export interface RulesValues {
  limitCents: number;
  dailyLimitCents: number;
  unusualMultiple: number;
  holdMinutes: number;
  ask: "everyone" | "organizer";
}

/** What sends Mom's payment for a second look, who is asked, and how long it waits. */
export function RulesForm({
  as,
  values,
  organizer,
  sibling,
  children,
}: {
  as: Viewer;
  values: RulesValues;
  organizer: string;
  sibling: string;
  /** The rules that always apply (new payees, the wording), shown between the limits and who is asked. */
  children: ReactNode;
}) {
  const save = useSave(changeRules);
  const viewer = as === "tom" ? "Tom" : "Sarah";
  const [limit, setLimit] = useState(values.limitCents);
  const [daily, setDaily] = useState(values.dailyLimitCents);
  // A day's limit can't be below one payment's: raising the one-payment limit past it raises the day's to match, and
  // the day's answers below it can't be picked. If the server still refuses the pair, the day's limit points at why.
  const chooseLimit = (next: number) => {
    setLimit(next);
    setDaily((current) => Math.max(current, lowestDaily(next)));
  };
  const dailyRefused = !save.pending && Boolean(save.state.error?.startsWith("The daily limit"));
  return (
    <form {...save.form} className={r.form}>
      <input type="hidden" name="as" value={as} />
      <fieldset className={r.group}>
        <legend className="visually-hidden">A payment gets a second look when</legend>
        <Choice
          name="limitCents"
          label={RULES_COPY.limit.label}
          value={limit}
          onChange={chooseLimit}
          options={CHOICES.limitCents}
          words={dollars}
        />
        <Choice
          name="dailyLimitCents"
          label={RULES_COPY.daily.label}
          hint={dailyFloor(limit)}
          value={daily}
          onChange={setDaily}
          options={CHOICES.dailyLimitCents}
          words={dollars}
          unavailable={(c) => c < limit}
          describedBy={dailyRefused ? "rules-save-error" : undefined}
        />
        <Choice
          name="unusualMultiple"
          label={RULES_COPY.unusual.label}
          value={values.unusualMultiple}
          options={CHOICES.unusualMultiple}
          words={timesWords}
        />
        {children}
      </fieldset>

      <fieldset className={r.group}>
        <legend className={r.legend}>{RULES_COPY.ask.label}</legend>
        <div className={r.radios}>
          {askChoices({ viewer, organizer, sibling }).map((choice) => (
            <label key={choice.value} className={r.radio}>
              <input type="radio" name="ask" value={choice.value} defaultChecked={values.ask === choice.value} />
              <span>
                <span className={r.radioLabel}>{choice.label}</span>
                <span className={r.hint}>{choice.detail}</span>
              </span>
            </label>
          ))}
        </div>
        <Choice
          name="holdMinutes"
          label={RULES_COPY.hold.label}
          hint={RULES_COPY.hold.help}
          value={values.holdMinutes}
          options={CHOICES.holdMinutes}
          words={waitWords}
        />
      </fieldset>

      <SaveRow label="Save the rules" note="Changes apply from Mom’s next payment." save={save} as={as} errorId="rules-save-error" />
    </form>
  );
}

export interface BillValue {
  key: string;
  name: string;
  what: string;
  chosen: boolean;
  usualAmountCents: number;
}

function BillRow({ bill }: { bill: BillValue }) {
  const [on, setOn] = useState(bill.chosen);
  const id = `bill-${bill.key}`;
  return (
    <li className={r.bill}>
      <input
        id={id}
        type="checkbox"
        name={`pay:${bill.key}`}
        defaultChecked={bill.chosen}
        className={r.check}
        onChange={(e) => setOn(e.currentTarget.checked)}
        aria-describedby={`${id}-what`}
      />
      <div className={r.billText}>
        <label htmlFor={id} className={r.label}>
          {bill.name}
        </label>
        <p id={`${id}-what`} className={r.hint}>
          {bill.what}
        </p>
        <label className={r.usual} data-off={!on || undefined}>
          <span>Usually</span>
          <span className={r.money}>
            <span aria-hidden="true">$</span>
            <input
              name={`usual:${bill.key}`}
              defaultValue={amountText(bill.usualAmountCents)}
              inputMode="decimal"
              autoComplete="off"
              disabled={!on}
              className={r.moneyInput}
              aria-label={`Usual amount for ${bill.name}, in dollars`}
            />
          </span>
        </label>
      </div>
    </li>
  );
}

/** Mom's regular bills: who she pays without a second look, and what each usually comes to. */
export function BillsForm({ as, bills }: { as: Viewer; bills: BillValue[] }) {
  const save = useSave(changeBills);
  return (
    <form {...save.form} className={r.form}>
      <input type="hidden" name="as" value={as} />
      <ul className={r.bills}>
        {bills.map((bill) => (
          <BillRow key={bill.key} bill={bill} />
        ))}
      </ul>
      <SaveRow label="Save Mom’s bills" note="Anyone else Mom pays comes to you first." save={save} as={as} range={USUAL_AMOUNT_RANGE} />
    </form>
  );
}

/** The split as the setup step draws it: Sarah's part in her cornflower, Tom's in his ochre, each named. */
function SplitStrip({ id, sarahShare }: { id: string; sarahShare: number }) {
  const parts = [
    { name: "Sarah", fabric: "sarah", percent: sarahShare },
    { name: "Tom", fabric: "tom", percent: 100 - sarahShare },
  ].filter((p) => p.percent > 0);
  return (
    <p id={id} className={r.split} aria-live="polite">
      {parts.map((p) => (
        <span key={p.name} className={r.splitPart} data-fabric={p.fabric} style={{ flexGrow: p.percent } as CSSProperties}>
          {p.name} {p.percent}%
        </span>
      ))}
    </p>
  );
}

/** Rosa's pay per visit and how Sarah and Tom split it. */
export function CareForm({
  as,
  aide,
  visitRateCents,
  sarahShare,
}: {
  as: Viewer;
  aide: string;
  visitRateCents: number;
  sarahShare: number;
}) {
  const save = useSave(changeCare);
  const [share, setShare] = useState(sarahShare);
  return (
    <form {...save.form} className={r.form}>
      <input type="hidden" name="as" value={as} />
      <div className={r.field}>
        <div>
          <label htmlFor="care-rate" className={r.label}>
            <span className={styles.aideName}>{aide}</span>
            {RATE_AFTER_NAME}
          </label>
          <p id="care-rate-hint" className={r.hint}>
            {rateRange(VISIT_RATE_RANGE)}
          </p>
        </div>
        <span className={r.money}>
          <span aria-hidden="true">$</span>
          <input
            id="care-rate"
            name="visitRate"
            defaultValue={amountText(visitRateCents)}
            inputMode="decimal"
            autoComplete="off"
            className={r.moneyInput}
            aria-describedby="care-rate-hint"
          />
        </span>
      </div>
      <div className={r.field} data-stacked>
        <div>
          <label htmlFor="rule-sarahShare" className={r.label}>
            {splitLabel(as === "tom" ? "Sarah" : "Tom")}
          </label>
          <p id="rule-sarahShare-hint" className={r.hint}>
            {RULES_COPY.split.help}
          </p>
        </div>
        <div className={r.splitLine}>
          <select
            id="rule-sarahShare"
            name="sarahShare"
            value={share}
            onChange={(e) => setShare(Number(e.currentTarget.value))}
            className={r.select}
            aria-describedby="rule-sarahShare-hint rule-sarahShare-parts"
          >
            {SHARES.map((s) => (
              <option key={s} value={s}>
                {shareWords(s)}
              </option>
            ))}
          </select>
          <SplitStrip id="rule-sarahShare-parts" sarahShare={share} />
        </div>
      </div>
      <SaveRow label="Save care costs" note={`A new rate starts with ${aide}’s next visit.`} save={save} as={as} range={VISIT_RATE_RANGE} />
    </form>
  );
}
