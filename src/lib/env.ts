type Env = Record<string, string | undefined>;

/**
 * Hard rule 7: the app only ever talks to the PayPal sandbox. Anything other than the exact string "sandbox"
 * (including "Sandbox" or a missing value) is refused, so a typo can't quietly point the app somewhere else.
 */
export function assertSandbox(env: Env = process.env): "sandbox" {
  const value = env.PAYPAL_ENV;
  if (value !== "sandbox") {
    const shown = value === undefined ? "not set" : JSON.stringify(value);
    throw new Error(`Refusing to start: PAYPAL_ENV must be "sandbox" (it is ${shown}).`);
  }
  return value;
}
