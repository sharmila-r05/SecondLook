"use client";

import { Info } from "lucide-react";
import { type FormEvent, useActionState, useState } from "react";
import { Stitch } from "@/components/quilt/Stitch";
import { formatUsd, toAmount } from "@/lib/money";
import { dollarsToCents, USUAL_AMOUNT_RANGE } from "@/lib/settings";
import type { BillRow } from "@/lib/setup-view";
import { saveBillsStep, type StepState } from "./actions";
import { MoneyInput, SubmitRow } from "./fields";
import styles from "./setup.module.css";

const whole = (cents: number) => formatUsd(cents).replace(/\.00$/, "");

/** Step 1: which of the catalog's bills Mom pays herself, and what each usually comes to. */
export function BillsForm({ rows, preselect }: { rows: BillRow[]; preselect: boolean }) {
  const [state, action, pending] = useActionState<StepState, FormData>(saveBillsStep, {});
  const [chosen, setChosen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.map((r) => [r.key, preselect || r.chosen])),
  );
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.key, toAmount(r.usualAmountCents)])),
  );
  const [invalid, setInvalid] = useState<string | null>(null);
  const none = rows.every((r) => !chosen[r.key]);
  const range = `${whole(USUAL_AMOUNT_RANGE.minCents)} to ${whole(USUAL_AMOUNT_RANGE.maxCents)}`;
  const problem = rows.find((r) => r.key === invalid);

  // Caught here first, with the bill named and an example; the server checks again and its error shows if this misses.
  const outOfRange = (text: string) => {
    const cents = dollarsToCents(text);
    return cents === null || cents < USUAL_AMOUNT_RANGE.minCents || cents > USUAL_AMOUNT_RANGE.maxCents;
  };

  function check(event: FormEvent<HTMLFormElement>) {
    const wrong = rows.find((r) => chosen[r.key] && outOfRange(amounts[r.key] ?? ""));
    setInvalid(wrong?.key ?? null);
    if (wrong) {
      event.preventDefault();
      document.getElementById(`usual-${wrong.key}`)?.focus();
    }
  }

  return (
    <form action={action} onSubmit={check} className={styles.form} noValidate>
      <div className={styles.section}>
        <ul className={styles.bills}>
          {rows.map((row) => {
            const on = Boolean(chosen[row.key]);
            const inputId = `usual-${row.key}`;
            return (
              <li key={row.key} className={styles.bill} data-chosen={on || undefined}>
                {on && <Stitch kind="sewn" />}
                <label className={styles.billPick}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    name={`pay:${row.key}`}
                    checked={on}
                    onChange={(e) => setChosen((c) => ({ ...c, [row.key]: e.target.checked }))}
                  />
                  <span className={styles.billText}>
                    <span className={styles.billName}>{row.name}</span>
                    <span className={styles.billWhat}>{row.what}</span>
                  </span>
                </label>
                <div className={styles.billAmount}>
                  <label htmlFor={inputId} className={styles.amountLabel}>
                    Usually<span className="visually-hidden"> for {row.name}</span>
                  </label>
                  <MoneyInput
                    id={inputId}
                    name={`usual:${row.key}`}
                    value={amounts[row.key] ?? ""}
                    disabled={!on}
                    describedBy="usual-range"
                    invalid={invalid === row.key}
                    onChange={(value) => {
                      setAmounts((a) => ({ ...a, [row.key]: value }));
                      // Once flagged, the message goes as soon as the amount is right.
                      if (invalid === row.key && !outOfRange(value)) setInvalid(null);
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <p id="usual-range" className={styles.help}>
          A usual amount can be anything from {range}. Mom can still pay anyone else; someone new just gets a second look first.
        </p>
        {none && (
          <p className={styles.warning} role="status">
            <Info aria-hidden="true" />
            <span>With no bills ticked, every payment Mom makes comes to you for a second look.</span>
          </p>
        )}
      </div>

      <SubmitRow
        pending={pending}
        label="Save and continue"
        pendingLabel="Saving…"
        error={problem ? `${problem.name}’s usual amount should be in dollars, from ${range}, like 84.00` : state.error}
      />
    </form>
  );
}
