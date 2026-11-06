import { cookies } from "next/headers";
import { isSessionId, SESSION_COOKIE } from "@/lib/session-cookie";

/** The visitor's demo session id. proxy.ts sets it on every page and API request before anything renders. */
export async function getSessionId(): Promise<string> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!isSessionId(value)) throw new Error("no demo session: is proxy.ts running for this route?");
  return value;
}
