// The businesses Margaret pays, each backed by its own PayPal sandbox account (hard rule 8: all fictional). The
// ready-made family knows both; a family being set up picks which ones Mom pays and what each bill usually comes to.

import { SANDBOX_EMAILS } from "./accounts";

export interface CatalogPayee {
  key: "electric" | "pharmacy";
  name: string;
  /** What the bill is, in Mom's words. */
  what: string;
  aliases: string[];
  paypalEmail: string;
  usualAmountCents: number;
}

export const PAYEE_CATALOG: readonly CatalogPayee[] = [
  {
    key: "electric",
    name: "Hollowbrook Electric",
    what: "The electric bill",
    aliases: ["electric", "electric bill", "electricity", "power", "power bill", "power company", "light bill", "hollowbrook"],
    paypalEmail: SANDBOX_EMAILS.electric,
    usualAmountCents: 8400,
  },
  {
    key: "pharmacy",
    name: "Elmwood Pharmacy",
    what: "Prescriptions",
    aliases: ["pharmacy", "drugstore", "prescription", "prescriptions", "medicine", "elmwood"],
    paypalEmail: SANDBOX_EMAILS.pharmacy,
    usualAmountCents: 2340,
  },
];

export function catalogPayee(key: string): CatalogPayee | undefined {
  return PAYEE_CATALOG.find((p) => p.key === key);
}
