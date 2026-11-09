"use client";

import { CircleAlert } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { SignInState } from "./actions";
import { signInStep } from "./step";
import styles from "./signin.module.css";

const START: SignInState = { stage: "email", email: "" };

/** "123 456": easier to read and type than six digits in a row (as in the email). */
function spaced(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** The form's main button: says what is happening while the step runs, and can't be pressed twice. */
function MainButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get("intent") !== "over";
  return (
    <button type="submit" className={styles.primary} disabled={pending} aria-busy={mine || undefined}>
      {mine ? busy : idle}
    </button>
  );
}

function DifferentEmail() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name="intent" value="over" className={styles.textButton} disabled={pending}>
      Use a different email
    </button>
  );
}

function ErrorLine({ id, text }: { id: string; text: string }) {
  return (
    <p id={id} className={styles.error} role="alert">
      <CircleAlert className={styles.errorIcon} aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}

/**
 * Sign-in in two stages on one action state: the email address, then the six-digit code from the email (or the link
 * in it, on any device). Errors come back from the step and show under its field.
 */
export function SignInForm({ minutes, linkExpired }: { minutes: number; linkExpired: boolean }) {
  const [state, action] = useActionState(signInStep, START);

  if (state.stage === "code") {
    return (
      <>
        <h1 className={styles.heading}>Check your email</h1>
        <p className={styles.lead} id="code-sent">
          We sent a link and a code to <strong className={styles.address}>{state.email}</strong>. Tap the link, or type the
          code here. Both work for {minutes} minutes.
        </p>

        {state.devCode && (
          <aside className={styles.dev} aria-labelledby="dev-heading">
            <h2 id="dev-heading" className={styles.devHeading}>
              Only on a development server
            </h2>
            <p>No email goes out here, so the code and link are shown instead.</p>
            <p className={styles.devCode}>{spaced(state.devCode)}</p>
            {state.devLink && (
              <a href={state.devLink} className={styles.textLink}>
                Open the sign-in link
              </a>
            )}
          </aside>
        )}

        <form action={action} className={styles.form} noValidate>
          <input type="hidden" name="step" value="code" />
          <div className={styles.field}>
            <label htmlFor="code" className={styles.label}>
              Six-digit code
            </label>
            <input
              id="code"
              name="code"
              className={`${styles.input} ${styles.codeInput}`}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={7}
              required
              autoFocus
              aria-invalid={state.error ? true : undefined}
              aria-describedby={state.error ? "code-error code-sent" : "code-sent"}
            />
            {state.error && <ErrorLine id="code-error" text={state.error} />}
          </div>
          <MainButton idle="Sign in" busy="Checking…" />
          <div className={styles.after}>
            <DifferentEmail />
            <p className={styles.hint}>Nothing yet? It can take a minute; check your spam folder too.</p>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      <h1 className={styles.heading}>Sign in with your email</h1>
      <p className={styles.lead} id="email-hint">
        We&rsquo;ll email you a link and a code, to set up your family or come back to it. Your address is only used to
        sign you in.
      </p>

      {linkExpired && state === START && (
        <p className={styles.notice} role="status">
          That sign-in link has expired or was already used. Type your email and we&rsquo;ll send a new one.
        </p>
      )}

      <form action={action} className={styles.form} noValidate>
        <input type="hidden" name="step" value="email" />
        <div className={styles.field}>
          <label htmlFor="email" className={styles.label}>
            Your email
          </label>
          <input
            key={state.email}
            id="email"
            name="email"
            type="email"
            className={styles.input}
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            autoCapitalize="none"
            required
            autoFocus={state !== START}
            defaultValue={state.email}
            aria-describedby={state.error ? "email-error email-hint" : "email-hint"}
          />
          {state.error && <ErrorLine id="email-error" text={state.error} />}
        </div>
        <MainButton idle="Email me a link and code" busy="Sending…" />
      </form>
    </>
  );
}
