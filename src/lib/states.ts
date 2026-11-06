// The one state machine for payment_requests.status. Every status write goes through transition(), paired with a
// conditional `update ... where status = <from>` so two racing writers can't both move the same request.

export const PAYMENT_REQUEST_STATES = [
  "new",
  "approved_auto",
  "held",
  "approved_by_family",
  "denied",
  "expired",
  "paid",
  "voided",
] as const;

export type PaymentRequestState = (typeof PAYMENT_REQUEST_STATES)[number];

//   new → approved_auto → paid
//   new → held → approved_by_family → paid
//              → denied  → voided
//              → expired → voided
export const ALLOWED_TRANSITIONS: Readonly<Record<PaymentRequestState, readonly PaymentRequestState[]>> =
  Object.freeze({
    new: Object.freeze(["approved_auto", "held"] as const),
    approved_auto: Object.freeze(["paid"] as const),
    held: Object.freeze(["approved_by_family", "denied", "expired"] as const),
    approved_by_family: Object.freeze(["paid"] as const),
    denied: Object.freeze(["voided"] as const),
    expired: Object.freeze(["voided"] as const),
    paid: Object.freeze([] as const),
    voided: Object.freeze([] as const),
  });

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`payment request cannot move from ${JSON.stringify(from)} to ${JSON.stringify(to)}`);
    this.name = "IllegalTransitionError";
  }
}

export function isPaymentRequestState(value: unknown): value is PaymentRequestState {
  return typeof value === "string" && (PAYMENT_REQUEST_STATES as readonly string[]).includes(value);
}

export function canTransition(from: string, to: string): boolean {
  return isPaymentRequestState(from) && isPaymentRequestState(to) && ALLOWED_TRANSITIONS[from].includes(to);
}

/** Returns `to` if the move is allowed; throws IllegalTransitionError otherwise (including unknown states). */
export function transition(from: string, to: string): PaymentRequestState {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
  return to as PaymentRequestState;
}
