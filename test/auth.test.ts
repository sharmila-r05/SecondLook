import { beforeAll, describe, expect, it } from "vitest";
import { emailHash, normalizeEmail, signAccount, verifyAccountCookie } from "@/lib/auth";
import { signInEmail, spacedCode } from "@/lib/email";
import { isPerson, screenOf } from "@/lib/session-cookie";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-that-is-long-enough-0123456789";
});

describe("normalizeEmail", () => {
  it("trims and lowercases an address", () => {
    expect(normalizeEmail("  Tom.Hale@Example.COM ")).toBe("tom.hale@example.com");
  });

  it("refuses what can't be an address", () => {
    for (const bad of ["", "tom", "tom@", "@example.com", "tom@example", "tom hale@example.com", "<a>@example.com"]) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });
});

describe("emailHash", () => {
  it("is stable for an address and never contains it", () => {
    const hash = emailHash("tom@example.com");
    expect(hash).toBe(emailHash("tom@example.com"));
    expect(hash).not.toBe(emailHash("sarah@example.com"));
    expect(hash).not.toContain("tom");
  });
});

describe("the account cookie", () => {
  it("round-trips an account id", () => {
    const id = "6f1c3c1e-6d2a-4c58-9d0e-3f0d7b1a2c44";
    expect(verifyAccountCookie(signAccount(id))).toBe(id);
  });

  it("refuses an edited or unsigned cookie", () => {
    const signed = signAccount("6f1c3c1e-6d2a-4c58-9d0e-3f0d7b1a2c44");
    expect(verifyAccountCookie(`7${signed.slice(1)}`)).toBeNull();
    expect(verifyAccountCookie("6f1c3c1e-6d2a-4c58-9d0e-3f0d7b1a2c44")).toBeNull();
    expect(verifyAccountCookie(undefined)).toBeNull();
  });
});

describe("the sign-in email", () => {
  it("carries the link and the spaced code, and says it's a sandbox demo", () => {
    const link = "https://secondlook.example/signin/link?t=abc";
    const mail = signInEmail(link, "042917");
    expect(spacedCode("042917")).toBe("042 917");
    expect(mail.subject).toContain("042 917");
    expect(mail.text).toContain(link);
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.text).toMatch(/sandbox/);
  });
});

describe("people and their screens", () => {
  it("opens each person's own screen", () => {
    expect(screenOf("Margaret")).toBe("/parent");
    expect(screenOf("Tom")).toBe("/family?as=tom");
    expect(screenOf("Rosa")).toBe("/aide");
    expect(isPerson("Sarah")).toBe(true);
    expect(isPerson("Mallory")).toBe(false);
  });
});
