"use server";

import { revalidatePath } from "next/cache";
import { ensureFamily, type Family } from "@/lib/family";
import { parseBills, saveBills, saveCare, saveRules } from "@/lib/family-setup";
import { getSessionId } from "@/lib/session";
import { parseCare, parseRules, SettingsError } from "@/lib/settings";

export type RulesState = { saved?: string; error?: string };

/** Sarah or Tom, from the screen the form was sent from. */
function changer(family: Family, form: FormData): string {
  const name = form.get("as") === "tom" ? "Tom" : "Sarah";
  const member = family.members.find((m) => m.name === name && m.role === "child");
  if (!member) throw new SettingsError("only Sarah or Tom can change the family's rules");
  return member.id;
}

async function change(form: FormData, save: (family: Family, sessionId: string, by: string) => Promise<void>, saved: string): Promise<RulesState> {
  const sessionId = await getSessionId();
  const family = await ensureFamily(sessionId);
  try {
    await save(family, sessionId, changer(family, form));
  } catch (err) {
    if (err instanceof SettingsError) return { error: err.message };
    throw err;
  }
  revalidatePath("/family");
  revalidatePath("/parent");
  return { saved };
}

export async function changeBills(_prev: RulesState, form: FormData): Promise<RulesState> {
  return change(form, (family, sessionId, by) => saveBills(family, sessionId, by, parseBills(form)), "Mom’s bills are saved.");
}

export async function changeRules(_prev: RulesState, form: FormData): Promise<RulesState> {
  return change(form, (family, sessionId, by) => saveRules(family, sessionId, by, parseRules(form)), "The rules are saved. They apply from Mom’s next payment.");
}

export async function changeCare(_prev: RulesState, form: FormData): Promise<RulesState> {
  return change(form, (family, sessionId, by) => saveCare(family, sessionId, by, parseCare(form)), "Care costs are saved. The new rate starts with Rosa’s next visit.");
}
