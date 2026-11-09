// The demo session cookie (hard rule 10): every row carries this id, and Reset clears only its rows.
// Kept free of server-only imports so proxy.ts can use it.

export const SESSION_COOKIE = "sl_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * Whose device this is, once an invite or a sign-in said so: "/" opens that person's screen. Not a permission (the
 * demo's person tabs still switch freely); just where this device belongs.
 */
export const DEVICE_COOKIE = "sl_as";
export const PEOPLE = ["Margaret", "Sarah", "Tom", "Rosa"] as const;
export type Person = (typeof PEOPLE)[number];

export function isPerson(value: unknown): value is Person {
  return typeof value === "string" && (PEOPLE as readonly string[]).includes(value);
}

/** Each person's own screen. */
export function screenOf(person: Person): string {
  switch (person) {
    case "Margaret":
      return "/parent";
    case "Sarah":
      return "/family";
    case "Tom":
      return "/family?as=tom";
    case "Rosa":
      return "/aide";
  }
}

/** The cookie options every Second Look cookie shares. */
export function cookieOptions(maxAge = SESSION_MAX_AGE_SECONDS) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge };
}
