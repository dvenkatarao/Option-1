import { afterEach, describe, expect, it } from "vitest";
import { createSchwabOAuthState, verifySchwabOAuthState } from "../src/lib/schwab-auth";

const originalKey = process.env.PORTFOLIO_ENCRYPTION_KEY;

afterEach(() => {
  if (originalKey == null) delete process.env.PORTFOLIO_ENCRYPTION_KEY;
  else process.env.PORTFOLIO_ENCRYPTION_KEY = originalKey;
});

describe("Schwab OAuth state protection", () => {
  it("accepts a signed, unexpired state only for the matching callback", () => {
    process.env.PORTFOLIO_ENCRYPTION_KEY = "test-key-".padEnd(40, "x");
    const now = Date.now();
    const generated = createSchwabOAuthState(now);

    expect(verifySchwabOAuthState(generated.cookieValue, generated.state, now + 5_000)).toBe(true);
    expect(verifySchwabOAuthState(generated.cookieValue, "attacker-state", now + 5_000)).toBe(false);
    const tamperedCookie = `${generated.cookieValue.slice(0, -1)}${generated.cookieValue.endsWith("A") ? "B" : "A"}`;
    expect(verifySchwabOAuthState(tamperedCookie, generated.state, now + 5_000)).toBe(false);
    expect(verifySchwabOAuthState(generated.cookieValue, generated.state, now + 11 * 60_000)).toBe(false);
  });

  it("refuses to mint state without a strong configured encryption key", () => {
    process.env.PORTFOLIO_ENCRYPTION_KEY = "short";
    expect(() => createSchwabOAuthState()).toThrow(/strong PORTFOLIO_ENCRYPTION_KEY/);
  });
});
