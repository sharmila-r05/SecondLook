// What the setup steps and the family's Rules tab read: Mom's bills as chosen so far, and each person's invite.

import QRCode from "qrcode";
import { db } from "@/lib/db";
import { PAYEE_CATALOG } from "@/lib/demo/payees";
import type { Family } from "@/lib/family";
import { inviteCodeFor } from "@/lib/join";
import { isPerson, type Person } from "@/lib/session-cookie";
import { savedPayPal } from "@/lib/vault";

export interface BillRow {
  key: string;
  name: string;
  what: string;
  chosen: boolean;
  usualAmountCents: number;
}

/** Each catalog payee, with whether Mom pays it and what it usually comes to (the catalog's figure until chosen). */
export async function getBillChoices(family: Pick<Family, "id">): Promise<BillRow[]> {
  const rows = await db()<{ paypal_email: string | null; known: boolean; usual_amount_cents: string | null }[]>`
    select paypal_email, known, usual_amount_cents from payees where family_id = ${family.id} and paypal_email is not null`;
  return PAYEE_CATALOG.map((p) => {
    const row = rows.find((r) => r.paypal_email === p.paypalEmail);
    return {
      key: p.key,
      name: p.name,
      what: p.what,
      chosen: row?.known ?? false,
      usualAmountCents: row?.usual_amount_cents ? Number(row.usual_amount_cents) : p.usualAmountCents,
    };
  });
}

export interface Invite {
  person: Person;
  /** Who they are to the organizer: "Mom", "your sister", "your brother", "Mom's aide". */
  relation: string;
  url: string;
  /** The same link as a QR code (SVG markup, dark on white). */
  qrSvg: string;
  joinedAt: Date | null;
}

export interface Devices {
  invites: Invite[];
  momConnectedPayPal: boolean;
  momAgreed: boolean;
}

function relationTo(organizer: string, person: Person): string {
  if (person === "Margaret") return "Mom";
  if (person === "Rosa") return "Mom’s aide";
  return organizer === "Sarah" ? "your brother" : "your sister";
}

/** Invites for everyone but the organizer: Mom's tablet first, then the sibling, then Rosa. */
export async function getDevices(family: Family, sessionId: string, origin: string): Promise<Devices> {
  const organizer = family.members.find((m) => m.id === family.settings.organizerId)?.name ?? "Sarah";
  const order: Person[] = ["Margaret", organizer === "Sarah" ? "Tom" : "Sarah", "Rosa"];
  const invites: Invite[] = [];
  for (const person of order) {
    const member = family.members.find((m) => m.name === person);
    if (!member || !isPerson(member.name)) continue;
    const url = `${origin}/join/${await inviteCodeFor(sessionId, member.id)}`;
    const qrSvg = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#1a1720", light: "#ffffff" } });
    invites.push({ person, relation: relationTo(organizer, person), url, qrSvg, joinedAt: member.joinedAt });
  }
  return { invites, momConnectedPayPal: (await savedPayPal(family)) !== null, momAgreed: family.settings.parentAgreedAt !== null };
}
