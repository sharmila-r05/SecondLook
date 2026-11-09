// A family's own rules: what sends Margaret's payment for a second look, how long it waits, who is asked, and what
// care costs. The person who sets the family up chooses them (setup), and Sarah or Tom can change them later (the
// family's Rules tab). Every choice is from a short list, so a form can't store something the rest of the app
// doesn't expect; amounts are integer cents (hard rule 5).

import type { RiskPolicy } from "@/lib/risk";

export interface FamilySettings {
  origin: "ready" | "setup";
  organizerId: string | null;
  limitCents: number;
  dailyLimitCents: number;
  unusualMultiple: number;
  holdMinutes: number;
  ask: "everyone" | "organizer";
  visitRateCents: number;
  /** Sarah's and Tom's shares of care costs, by member id, in percent summing to 100. */
  split: Record<string, number>;
  setupStep: SetupStep | null;
  setupCompletedAt: Date | null;
  parentAgreedAt: Date | null;
}

export type SetupStep = "bills" | "rules" | "care" | "devices";
export const SETUP_STEPS: readonly SetupStep[] = ["bills", "rules", "care", "devices"];

export const CHOICES = {
  limitCents: [10_000, 20_000, 30_000, 50_000, 100_000],
  dailyLimitCents: [30_000, 50_000, 100_000, 200_000],
  unusualMultiple: [2, 3, 5],
  /** 10 minutes suits a demo; an hour or a day suits a real family. */
  holdMinutes: [10, 60, 1440],
  ask: ["everyone", "organizer"],
  /** Sarah's share of care costs, in percent; Tom has the rest. */
  sarahShare: [0, 30, 40, 50, 60, 70, 100],
} as const;

/** Rosa's rate is typed, so it has a range instead of a list. */
export const VISIT_RATE_RANGE = { minCents: 1_000, maxCents: 50_000 } as const;
/** A known payee's usual amount, also typed. */
export const USUAL_AMOUNT_RANGE = { minCents: 100, maxCents: 500_000 } as const;

export const DEFAULT_HOLD_MINUTES = Number(process.env.HOLD_TIMEOUT_MINUTES ?? 10) || 10;

export function riskPolicy(settings: Pick<FamilySettings, "limitCents" | "dailyLimitCents" | "unusualMultiple">): RiskPolicy {
  return { defaultLimitCents: settings.limitCents, dailyLimitCents: settings.dailyLimitCents, unusualMultiple: settings.unusualMultiple };
}

export interface Rules {
  limitCents: number;
  dailyLimitCents: number;
  unusualMultiple: number;
  holdMinutes: number;
  ask: "everyone" | "organizer";
}

export interface Care {
  visitRateCents: number;
  sarahShare: number;
}

export class SettingsError extends Error {}

function oneOf<T extends string | number>(value: FormDataEntryValue | null, allowed: readonly T[], what: string): T {
  const raw = typeof value === "string" ? value.trim() : "";
  const found = allowed.find((a) => String(a) === raw);
  if (found === undefined) throw new SettingsError(`${what} isn't one of the choices`);
  return found;
}

/**
 * Dollars as typed ("50", "$50", "50.00", "1,200") to integer cents, or null when it isn't an amount. Never goes
 * through a float: the whole and cent parts are read as integers.
 */
export function dollarsToCents(text: string): number | null {
  const cleaned = text.trim().replace(/^\$/, "").replace(/,/g, "");
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const whole = Number(match[1]);
  const cents = match[2] ? Number(match[2].padEnd(2, "0")) : 0;
  return whole * 100 + cents;
}

export function typedCents(value: FormDataEntryValue | null, range: { minCents: number; maxCents: number }, what: string): number {
  const cents = typeof value === "string" ? dollarsToCents(value) : null;
  if (cents === null || cents < range.minCents || cents > range.maxCents) throw new SettingsError(`${what} isn't an amount in range`);
  return cents;
}

/** The Rules form: limit, daily limit, "times the usual", how long a hold waits, who's asked. */
export function parseRules(form: FormData): Rules {
  const rules: Rules = {
    limitCents: oneOf(form.get("limitCents"), CHOICES.limitCents, "The limit"),
    dailyLimitCents: oneOf(form.get("dailyLimitCents"), CHOICES.dailyLimitCents, "The daily limit"),
    unusualMultiple: oneOf(form.get("unusualMultiple"), CHOICES.unusualMultiple, "The unusual amount"),
    holdMinutes: oneOf(form.get("holdMinutes"), CHOICES.holdMinutes, "The wait"),
    ask: oneOf(form.get("ask"), CHOICES.ask, "Who's asked"),
  };
  if (rules.dailyLimitCents < rules.limitCents) throw new SettingsError("The daily limit can't be below the limit for one payment");
  return rules;
}

/** The Care form: Rosa's rate per visit and how Sarah and Tom split the cost. */
export function parseCare(form: FormData): Care {
  return {
    visitRateCents: typedCents(form.get("visitRate"), VISIT_RATE_RANGE, "Rosa's rate"),
    sarahShare: oneOf(form.get("sarahShare"), CHOICES.sarahShare, "Sarah's share"),
  };
}

/** The family's split rule from Sarah's share: whole percents summing to 100 (care.ts splits the cents exactly). */
export function splitRule(sarahId: string, tomId: string, sarahShare: number): Record<string, number> {
  return { [sarahId]: sarahShare, [tomId]: 100 - sarahShare };
}

/** A wait in plain words: "10 minutes", "an hour", "a day". */
export function holdWords(minutes: number): string {
  if (minutes === 60) return "an hour";
  if (minutes === 1440) return "a day";
  if (minutes % 1440 === 0) return `${minutes / 1440} days`;
  if (minutes % 60 === 0) return `${minutes / 60} hours`;
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}
