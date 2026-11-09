"use client";

import { ArrowLeft, Check, CircleAlert } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, type ReactNode, useId } from "react";
import { useFormStatus } from "react-dom";
import styles from "./setup.module.css";

export interface Choice<T extends string | number> {
  value: T;
  /** What the patch shows. */
  label: ReactNode;
  /** A sentence under the label, for the full-width rows. */
  detail?: ReactNode;
  /** The spoken name when the label is terse ("60 / 40"). */
  name?: string;
}

/** One question with a short list of answers: radio buttons drawn as small solid patches, the chosen one in plum. */
export function ChoiceGroup<T extends string | number>({
  name,
  legend,
  help,
  choices,
  value,
  onChange,
  rows = false,
  optionClass,
  listClass,
  children,
}: {
  name: string;
  legend: ReactNode;
  help?: ReactNode;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Full-width rows with a sentence each, instead of a wrapping row of patches. */
  rows?: boolean;
  optionClass?: string;
  /** Overrides the row of patches' layout (the split's seven answers wrap on a phone). */
  listClass?: string;
  children?: ReactNode;
}) {
  const helpId = useId();
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{legend}</legend>
      {help && (
        <p id={helpId} className={styles.help}>
          {help}
        </p>
      )}
      <div
        className={rows ? styles.rowsChoice : `${styles.pills} ${listClass ?? ""}`}
        style={rows ? undefined : ({ "--count": choices.length } as CSSProperties)}
      >
        {choices.map((choice) => (
          <label key={String(choice.value)} className={optionClass ? `${styles.option} ${optionClass}` : styles.option}>
            <input
              type="radio"
              className={styles.radio}
              name={name}
              value={String(choice.value)}
              checked={value === choice.value}
              onChange={() => onChange(choice.value)}
              aria-label={choice.name}
              aria-describedby={help ? helpId : undefined}
            />
            {rows ? (
              <>
                <span className={styles.optionTitle}>{choice.label}</span>
                {choice.detail && <span className={styles.optionDetail}>{choice.detail}</span>}
                <Check className={styles.tick} aria-hidden="true" />
              </>
            ) : (
              choice.label
            )}
          </label>
        ))}
      </div>
      {children}
    </fieldset>
  );
}

/** Dollars typed into a box with a "$" in front. The value is text; the server reads it into whole cents. */
export function MoneyInput({
  id,
  name,
  value,
  onChange,
  disabled = false,
  invalid = false,
  describedBy,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <span className={styles.moneyBox}>
      <span aria-hidden="true">$</span>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  );
}

/** What went wrong, beside the button that tried; said aloud as it appears. */
export function FormError({ error }: { error?: string }) {
  if (!error) return null;
  const text = error.replace(/'/g, "’");
  return (
    <p className={styles.error} role="alert">
      <CircleAlert aria-hidden="true" />
      <span>{/[.!?]$/.test(text) ? text : `${text}.`}</span>
    </p>
  );
}

/** A step's foot: the error if saving failed, the save button (it says it's saving), and the way back. */
export function SubmitRow({
  pending,
  label,
  pendingLabel,
  error,
  back,
  note,
}: {
  pending: boolean;
  label: string;
  pendingLabel: string;
  error?: string;
  back?: { href: string; label: string };
  note?: ReactNode;
}) {
  return (
    <div className={styles.actions}>
      <FormError error={error} />
      {note && <p className={styles.note}>{note}</p>}
      <button type="submit" className={styles.primary} disabled={pending} aria-busy={pending || undefined}>
        {pending ? pendingLabel : label}
      </button>
      {back && (
        <Link href={back.href} className={styles.back}>
          <ArrowLeft aria-hidden="true" />
          {back.label}
        </Link>
      )}
    </div>
  );
}

/** A submit button for a form whose action redirects: while it works it says so and can't be pressed twice. */
export function PendingButton({ className, pending, children }: { className?: string; pending: string; children: ReactNode }) {
  const status = useFormStatus();
  return (
    <button type="submit" className={className} disabled={status.pending} aria-busy={status.pending || undefined}>
      {status.pending ? pending : children}
    </button>
  );
}
