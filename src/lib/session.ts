import { cookies } from "next/headers";
import { DEVICE_COOKIE, isPerson, isSessionId, type Person, SESSION_COOKIE } from "@/lib/session-cookie";

/** The visitor's demo session id. proxy.ts sets it on every page and API request before anything renders. */
export async function getSessionId(): Promise<string> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!isSessionId(value)) throw new Error("no demo session: is proxy.ts running for this route?");
  return value;
}

/** Whose device this is, if an invite or a sign-in said so. */
export async function getDevicePerson(): Promise<Person | null> {
  const value = (await cookies()).get(DEVICE_COOKIE)?.value;
  return isPerson(value) ? value : null;
}
