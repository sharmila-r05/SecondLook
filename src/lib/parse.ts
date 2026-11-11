// Turns what Margaret said ("Pay the electric bill, $84") into a payee and an amount, with plain patterns and no model
// call. A request in any other shape isn't guessed at: she is asked to say it again. Code, never a model, decides money.

import { toCents } from "@/lib/money";
import { ACRONYM_WORDS, normalize } from "@/lib/risk";

export type Parsed =
  | { kind: "bill"; payeeText: string; amountCents: number; reason: string }
  | { kind: "visit" };

// "$1,500", "$84", "84.50", "1500 dollars"
const AMOUNT = String.raw`\$?\s?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?:\s?(?:dollars|bucks))?`;
const PAY_AMOUNT_TO = new RegExp(String.raw`^pay ${AMOUNT} (?:to|for) (?:the )?(.+?)(?: bill)?(?:$| for | because | they | he | she | since | so )(.*)$`);
const PAY_PAYEE_AMOUNT = new RegExp(String.raw`^pay (?:the |my )?(.+?)(?: bill)? ${AMOUNT}(?: (.*))?$`);
const VISIT = /\b(came|was here|visited|has been here|has come)\b/;

function amountToCents(raw: string): number {
  return toCents(raw.replace(/,/g, ""));
}

export function parseRequest(text: string, aideName = "Rosa"): Parsed | null {
  // Keep "$", "." and "," for amounts; normalize() strips the rest.
  const said = text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'$., ]+/g, " ")
    .replace(/(\d),(?!\d{3})/g, "$1 ")
    .replace(/,(?=\s|$)/g, " ")
    .replace(/\.(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (said.includes(aideName.toLowerCase()) && VISIT.test(said)) return { kind: "visit" };

  const first = PAY_AMOUNT_TO.exec(said);
  if (first?.[1] && first[2]) {
    return { kind: "bill", amountCents: amountToCents(first[1]), payeeText: first[2].trim(), reason: (first[3] ?? "").trim() };
  }
  const second = PAY_PAYEE_AMOUNT.exec(said);
  if (second?.[1] && second[2]) {
    return { kind: "bill", payeeText: second[1].trim(), amountCents: amountToCents(second[2]), reason: (second[3] ?? "").trim() };
  }
  return null;
}

/** One word for display: an acronym in capitals, anything else with a capital first letter. */
export function displayWord(word: string): string {
  return ACRONYM_WORDS.has(word.toLowerCase()) ? word.toUpperCase() : word.replace(/^[a-z]/, (c) => c.toUpperCase());
}

/**
 * The payee's name as Margaret meant it. When she typed it with capitals ("IRS", "McKinley Plumbing"), her own
 * spelling is kept; when speech recognition gave it lower case, each word gets a capital and acronyms stay capitals.
 */
export function payeeDisplayName(payeeText: string, said: string): string {
  const words = payeeText.trim().split(/\s+/);
  const asTyped = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s,.]+"), "i").exec(said)?.[0];
  if (asTyped && /[A-Z]/.test(asTyped)) return asTyped.replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/[\s,.]+/g, " ");
  return words.map(displayWord).join(" ");
}

export interface PayeeCandidate {
  id: string;
  name: string;
  aliases: readonly string[];
}

/** The family's payee Margaret meant, or null for someone new. "the electric bill" matches "electric bill". */
export function matchPayee<T extends PayeeCandidate>(payeeText: string, payees: readonly T[]): T | null {
  const heard = normalize(payeeText).replace(/^(the|my) /, "").replace(/ bill$/, "");
  if (heard.length < 3) return null;
  for (const payee of payees) {
    const names = [payee.name, ...payee.aliases].map((n) => normalize(n).replace(/ bill$/, ""));
    if (names.some((n) => n === heard || (n.length >= 4 && heard.includes(n)) || (heard.length >= 4 && n.includes(heard)))) {
      return payee;
    }
  }
  return null;
}
