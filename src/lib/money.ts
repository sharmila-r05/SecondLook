// Money is always a whole number of cents (hard rule 5). Floats never touch an amount: strings are parsed
// with a regex, and splits use integer arithmetic only.

// "84", "84.5", "84.00", "0.05". No sign, no exponent, no thousands separators, at most two decimals.
const AMOUNT = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;
const MAX_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

export function assertCents(cents: unknown, what = "amount"): asserts cents is number {
  if (typeof cents !== "number" || !Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError(`${what} must be a non-negative whole number of cents, got ${String(cents)}`);
  }
}

/** "84.00" → 8400. Throws on anything that isn't a plain non-negative amount with at most two decimals. */
export function toCents(amount: string): number {
  const match = typeof amount === "string" ? AMOUNT.exec(amount) : null;
  if (!match) throw new RangeError(`not a valid amount: ${JSON.stringify(amount)}`);
  const [, whole = "", fraction = ""] = match;
  const cents = BigInt(whole + fraction.padEnd(2, "0"));
  if (cents > MAX_CENTS) throw new RangeError(`amount too large: ${amount}`);
  return Number(cents);
}

/** 8400 → "84.00", the form PayPal expects in `amount.value`. */
export function toAmount(cents: number): string {
  assertCents(cents);
  const digits = String(cents).padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/** 150000 → "$1,500.00", for people to read. */
export function formatUsd(cents: number): string {
  const [dollars = "0", fraction = "00"] = toAmount(cents).split(".");
  return `$${dollars.replace(/\B(?=(\d{3})+$)/g, ",")}.${fraction}`;
}

/**
 * Splits `totalCents` by whole-number weights (percentages such as {sarah: 50, tom: 50}, or any relative weights)
 * so the shares always add up to exactly the total.
 *
 * Largest-remainder method: everyone gets the floor of their exact share, then the cents left over go one each
 * to the largest fractional remainders. When remainders tie (an odd total split evenly), `leftoverTo` goes first,
 * then the rest by id, so the same input always gives the same result.
 */
export function splitCents(
  totalCents: number,
  weights: Readonly<Record<string, number>>,
  leftoverTo: string,
): Record<string, number> {
  assertCents(totalCents, "total");
  const ids = Object.keys(weights);
  if (ids.length === 0) throw new RangeError("split needs at least one person");
  if (!Object.hasOwn(weights, leftoverTo)) throw new RangeError(`leftover person ${leftoverTo} is not in the split`);

  let weightSum = 0n;
  for (const id of ids) {
    const weight = weights[id];
    if (typeof weight !== "number" || !Number.isSafeInteger(weight) || weight < 0) {
      throw new RangeError(`weight for ${id} must be a non-negative whole number, got ${String(weight)}`);
    }
    weightSum += BigInt(weight);
  }
  if (weightSum === 0n) throw new RangeError("weights must not all be zero");

  // BigInt so total × weight can't lose precision, however large the total.
  const total = BigInt(totalCents);
  const parts = ids.map((id) => {
    const exact = total * BigInt(weights[id] ?? 0);
    return { id, cents: exact / weightSum, remainder: exact % weightSum };
  });

  let leftover = total - parts.reduce((sum, part) => sum + part.cents, 0n);
  const order = [...parts].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    if (a.id === leftoverTo || b.id === leftoverTo) return a.id === leftoverTo ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  // leftover is always smaller than the number of people, so one pass hands it all out.
  for (const part of order) {
    if (leftover === 0n) break;
    part.cents += 1n;
    leftover -= 1n;
  }

  return Object.fromEntries(parts.map((part) => [part.id, Number(part.cents)]));
}
