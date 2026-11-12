import { describe, expect, it } from "vitest";
import type { Family, Member } from "@/lib/family";
import { appStartIn, homeIn, lockedPersonIn } from "@/lib/home";
import type { FamilySettings } from "@/lib/settings";

const members: Member[] = [
  { id: "m", name: "Margaret", role: "parent", joinedAt: null },
  { id: "s", name: "Sarah", role: "child", joinedAt: null },
  { id: "t", name: "Tom", role: "child", joinedAt: null },
  { id: "r", name: "Rosa", role: "aide", joinedAt: null },
];

function family(origin: FamilySettings["origin"], done: boolean): Family {
  return {
    id: "f",
    members,
    settings: {
      origin,
      organizerId: "t",
      limitCents: 30000,
      dailyLimitCents: 50000,
      unusualMultiple: 3,
      holdMinutes: 10,
      ask: "everyone",
      visitRateCents: 5000,
      split: { s: 50, t: 50 },
      setupStep: done ? null : "rules",
      setupCompletedAt: done ? new Date() : null,
      parentAgreedAt: null,
    },
  };
}

describe("where the installed app opens", () => {
  it("opens each invited device on its own person's screen once the family is set up", () => {
    const f = family("setup", true);
    expect(appStartIn(f, "Margaret", null)).toBe("/parent");
    expect(appStartIn(f, "Tom", null)).toBe("/family?as=tom");
    expect(appStartIn(f, "Sarah", null)).toBe("/family");
    expect(appStartIn(f, "Rosa", null)).toBe("/aide");
  });

  it("knows the person from the signed-in account when the device has no person yet", () => {
    expect(appStartIn(family("setup", true), null, { id: "a", sessionId: "x", person: "Tom" })).toBe("/family?as=tom");
  });

  it("sends the organizer back to the setup until it's finished", () => {
    expect(appStartIn(family("setup", false), "Tom", null)).toBe("/setup");
  });

  it("gives a device nobody was invited on the welcome page, not Sarah's screen", () => {
    expect(appStartIn(family("setup", true), null, null)).toBe("/");
  });

  it("keeps the ready-made family on the family screen, where its alerts are", () => {
    expect(appStartIn(family("ready", true), null, null)).toBe("/family");
    expect(homeIn(family("ready", true), "Margaret", null)).toBeNull();
  });
});

describe("a freshly installed app", () => {
  it("opens the welcome page, to sign in or try the ready-made family, never straight into a family", () => {
    expect(appStartIn(null, null, null)).toBe("/");
    expect(appStartIn(null, "Margaret", null)).toBe("/");
  });
});

describe("whose device is kept to their own screen", () => {
  it("keeps Mom's tablet and Rosa's phone to their own screen in a family someone set up", () => {
    const f = family("setup", true);
    expect(lockedPersonIn(f, "Margaret", null)).toBe("Margaret");
    expect(lockedPersonIn(f, "Rosa", null)).toBe("Rosa");
  });

  it("never keeps Sarah's or Tom's device, or one with no person yet", () => {
    const f = family("setup", true);
    expect(lockedPersonIn(f, "Sarah", null)).toBeNull();
    expect(lockedPersonIn(f, "Tom", null)).toBeNull();
    expect(lockedPersonIn(f, null, null)).toBeNull();
  });

  it("never locks out the organizer who opened Mom's link on their own signed-in device", () => {
    expect(lockedPersonIn(family("setup", true), "Margaret", { id: "a", sessionId: "x", person: "Tom" })).toBeNull();
  });

  it("leaves every tab open in the ready-made family, for judges looking around", () => {
    expect(lockedPersonIn(family("ready", true), "Margaret", null)).toBeNull();
    expect(lockedPersonIn(null, "Margaret", null)).toBeNull();
  });
});
