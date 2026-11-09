// The signed-in account on this device, read from and written to cookies. Signing in points this device at the
// account's family (its demo session) and remembers who the account is in it.

import { cookies } from "next/headers";
import { type Account, ACCOUNT_COOKIE, loadAccount, signAccount, verifyAccountCookie } from "@/lib/auth";
import { cookieOptions, DEVICE_COOKIE, type Person, SESSION_COOKIE } from "@/lib/session-cookie";

/** The account signed in on this device, if any. */
export async function getAccount(): Promise<Account | null> {
  const id = verifyAccountCookie((await cookies()).get(ACCOUNT_COOKIE)?.value);
  return id ? loadAccount(id) : null;
}

/** After a verified link or code: this device is the account's, in the account's family. */
export async function rememberSignIn(account: Account): Promise<void> {
  const jar = await cookies();
  jar.set({ name: ACCOUNT_COOKIE, value: signAccount(account.id), ...cookieOptions() });
  jar.set({ name: SESSION_COOKIE, value: account.sessionId, ...cookieOptions() });
  if (account.person) jar.set({ name: DEVICE_COOKIE, value: account.person, ...cookieOptions() });
  else jar.delete(DEVICE_COOKIE);
}

/** This device now belongs to this person (the organizer choosing Sarah or Tom). */
export async function rememberPerson(person: Person): Promise<void> {
  (await cookies()).set({ name: DEVICE_COOKIE, value: person, ...cookieOptions() });
}

/** Back to the account's own family, after looking at the ready-made one. */
export async function returnToAccountFamily(account: Account): Promise<void> {
  const jar = await cookies();
  jar.set({ name: SESSION_COOKIE, value: account.sessionId, ...cookieOptions() });
  if (account.person) jar.set({ name: DEVICE_COOKIE, value: account.person, ...cookieOptions() });
}

/**
 * Sign out on this device: the account and the person are forgotten, and the device gets a fresh demo session on
 * its next request (proxy.ts). The family itself is untouched; signing in again comes back to it.
 */
export async function forgetSignIn(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCOUNT_COOKIE);
  jar.delete(DEVICE_COOKIE);
  jar.delete(SESSION_COOKIE);
}
