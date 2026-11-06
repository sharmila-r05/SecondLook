// The demo session cookie (hard rule 10): every row carries this id, and Reset clears only its rows.
// Kept free of server-only imports so proxy.ts can use it.

export const SESSION_COOKIE = "sl_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
