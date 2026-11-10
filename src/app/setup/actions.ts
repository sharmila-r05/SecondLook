"use server";

import { redirect } from "next/navigation";
import { getAccount, rememberPerson } from "@/lib/account";
import { db } from "@/lib/db";
import { recordEvent } from "@/lib/events";
import { type Family, findFamily, startSetupFamily } from "@/lib/family";
import { parseBills, saveBills, saveCare, saveRules, applyDemoSavedPayPal } from "@/lib/family-setup";
import { getSessionId } from "@/lib/session";
import { screenOf } from "@/lib/session-cookie";
import { parseCare, parseRules, SettingsError } from "@/lib/settings";

export type StepState = { error?: string };

/** The signed-in organizer of the family being set up on this device, or a redirect to where they should be. */
async function organizerHere(): Promise<{ family: Family; sessionId: string; organizerId: string }> {
  const account = await getAccount();
  if (!account) redirect("/signin");
  const sessionId = await getSessionId();
  if (account.sessionId !== sessionId) redirect("/api/account/home");
  const family = await findFamily(sessionId);
  if (!family || family.settings.origin !== "setup") redirect("/setup");
  const organizer = family.members.find((m) => m.id === family.settings.organizerId);
  if (!organizer || organizer.name !== account.person) redirect("/api/account/home");
  return { family, sessionId, organizerId: organizer.id };
}

/** Step 0: "I'm Sarah" or "I'm Tom". Starts a new family set up by that person (replacing one begun before). */
export async function chooseOrganizer(form: FormData): Promise<void> {
  const account = await getAccount();
  if (!account) redirect("/signin");
  const sessionId = await getSessionId();
  if (account.sessionId !== sessionId) redirect("/api/account/home");
  // Starting over replaces the whole family, so once someone has set one up, only they can (not a sibling who signed in).
  const current = await findFamily(sessionId);
  const setUpBy = current?.settings.origin === "setup" ? current.members.find((m) => m.id === current.settings.organizerId)?.name : undefined;
  if (setUpBy && setUpBy !== account.person) redirect("/api/account/home");
  const organizer = form.get("person") === "Tom" ? "Tom" : "Sarah";
  const family = await startSetupFamily(sessionId, organizer, account.id);
  await rememberPerson(organizer);
  await recordEvent(db(), family, sessionId, "family:setup_started", { by: organizer });
  redirect("/setup");
}

async function step(save: () => Promise<void>, next: string): Promise<StepState> {
  try {
    await save();
  } catch (err) {
    if (err instanceof SettingsError) return { error: err.message };
    throw err;
  }
  redirect(next);
}

/** Step 1: the bills Mom pays, and what each usually comes to. */
export async function saveBillsStep(_prev: StepState, form: FormData): Promise<StepState> {
  const { family, sessionId, organizerId } = await organizerHere();
  return step(() => saveBills(family, sessionId, organizerId, parseBills(form)), "/setup?step=rules");
}

/** Step 2: what sends a payment for a second look, how long it waits, who's asked. */
export async function saveRulesStep(_prev: StepState, form: FormData): Promise<StepState> {
  const { family, sessionId, organizerId } = await organizerHere();
  return step(() => saveRules(family, sessionId, organizerId, parseRules(form)), "/setup?step=care");
}

/** Step 3: Rosa's rate and how the siblings split it. */
export async function saveCareStep(_prev: StepState, form: FormData): Promise<StepState> {
  const { family, sessionId, organizerId } = await organizerHere();
  return step(() => saveCare(family, sessionId, organizerId, parseCare(form)), "/setup?step=devices");
}

/** Demo only, on step 4: skip Mom's PayPal page and use the hosted demo's saved PayPal. */
export async function skipToDemoPayPal(): Promise<void> {
  const { family } = await organizerHere();
  await applyDemoSavedPayPal(family);
  redirect("/setup?step=devices");
}

/** Done with the invites: the organizer lands on their own screen. */
export async function finishSetupStep(): Promise<void> {
  const { family, organizerId } = await organizerHere();
  const organizer = family.members.find((m) => m.id === organizerId);
  redirect(organizer?.name === "Tom" ? screenOf("Tom") : screenOf("Sarah"));
}
