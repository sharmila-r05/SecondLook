import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  IllegalTransitionError,
  PAYMENT_REQUEST_STATES,
  canTransition,
  transition,
} from "@/lib/states";

const allowed: [string, string][] = [
  ["new", "approved_auto"],
  ["approved_auto", "paid"],
  ["new", "held"],
  ["held", "approved_by_family"],
  ["approved_by_family", "paid"],
  ["held", "denied"],
  ["denied", "voided"],
  ["held", "expired"],
  ["expired", "voided"],
];

describe("payment request states", () => {
  it("has exactly the transitions in the brief", () => {
    const table = Object.entries(ALLOWED_TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => [from, to]));
    expect(table.sort()).toEqual([...allowed].sort());
  });

  it.each(allowed)("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(transition(from, to)).toBe(to);
  });

  it("throws on every other pair of known states", () => {
    const isAllowed = new Set(allowed.map(([from, to]) => `${from}>${to}`));
    let checked = 0;
    for (const from of PAYMENT_REQUEST_STATES) {
      for (const to of PAYMENT_REQUEST_STATES) {
        if (isAllowed.has(`${from}>${to}`)) continue;
        expect(canTransition(from, to)).toBe(false);
        expect(() => transition(from, to)).toThrow(IllegalTransitionError);
        checked += 1;
      }
    }
    expect(checked).toBe(PAYMENT_REQUEST_STATES.length ** 2 - allowed.length);
  });

  it.each([
    ["held", "paid"], // a held payment is never captured without a family member's approval
    ["new", "paid"],
    ["denied", "paid"],
    ["expired", "paid"],
    ["voided", "paid"],
    ["paid", "voided"],
    ["approved_auto", "held"],
    ["denied", "approved_by_family"],
    ["held", "held"],
    ["new", "voided"],
  ])("refuses %s → %s", (from, to) => {
    expect(() => transition(from, to)).toThrow(`cannot move from "${from}" to "${to}"`);
  });

  it("throws on unknown states", () => {
    expect(() => transition("new", "approved")).toThrow(IllegalTransitionError);
    expect(() => transition("pending", "held")).toThrow(IllegalTransitionError);
    expect(() => transition("", "")).toThrow(IllegalTransitionError);
    expect(() => transition("constructor", "held")).toThrow(IllegalTransitionError);
  });

  it("can't be changed at run time", () => {
    expect(Object.isFrozen(ALLOWED_TRANSITIONS)).toBe(true);
    expect(Object.isFrozen(ALLOWED_TRANSITIONS.held)).toBe(true);
  });

  it("matches the database's status check", () => {
    const schema = readFileSync(new URL("../db/migrations/001_init.sql", import.meta.url), "utf8");
    const check = /status text not null check \(status in\s*\(([^)]*)\)\)/.exec(
      schema.slice(schema.indexOf("create table payment_requests")),
    );
    expect(check).not.toBeNull();
    const inDatabase = [...(check?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(inDatabase.sort()).toEqual([...PAYMENT_REQUEST_STATES].sort());
  });
});
