import { describe, expect, it } from "vitest";
import { assertSandbox } from "@/lib/env";

describe("assertSandbox", () => {
  it("refuses when PAYPAL_ENV is not set", () => {
    expect(() => assertSandbox({})).toThrow(/PAYPAL_ENV must be "sandbox" \(it is not set\)/);
    expect(() => assertSandbox({ PAYPAL_ENV: undefined })).toThrow(/not set/);
  });

  it("refuses live", () => {
    expect(() => assertSandbox({ PAYPAL_ENV: "live" })).toThrow(/it is "live"/);
  });

  it("refuses anything but the exact lower-case word", () => {
    for (const value of ["Sandbox", "SANDBOX", " sandbox", "sandbox ", "", "production"]) {
      expect(() => assertSandbox({ PAYPAL_ENV: value })).toThrow(/PAYPAL_ENV must be "sandbox"/);
    }
  });

  it("accepts sandbox", () => {
    expect(assertSandbox({ PAYPAL_ENV: "sandbox" })).toBe("sandbox");
  });

  it("reads process.env by default", () => {
    const before = process.env.PAYPAL_ENV;
    try {
      process.env.PAYPAL_ENV = "sandbox";
      expect(assertSandbox()).toBe("sandbox");
      process.env.PAYPAL_ENV = "live";
      expect(() => assertSandbox()).toThrow();
    } finally {
      if (before === undefined) delete process.env.PAYPAL_ENV;
      else process.env.PAYPAL_ENV = before;
    }
  });
});
