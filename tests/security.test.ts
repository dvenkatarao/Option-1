import { beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache, getEnv } from "@/lib/env";
import { decryptCredential, decryptJson, encryptCredential, maskAccountNumber } from "@/lib/security";

const base = { DATABASE_URL: "postgresql://x" };
function setEnv(vars: Record<string, string | undefined>) {
  for (const k of ["NODE_ENV", "PORTFOLIO_ENCRYPTION_KEY", "APP_PASSWORD", "NEXT_PHASE"]) delete process.env[k];
  Object.assign(process.env, base, vars);
  resetEnvCache();
}

describe("encryption", () => {
  beforeEach(() => setEnv({ NODE_ENV: "test" }));
  it("round-trips strings and objects", () => {
    expect(decryptCredential(encryptCredential("secret"))).toBe("secret");
    expect(decryptJson<{ a: number }>(encryptCredential({ a: 1 }))).toEqual({ a: 1 });
  });
  it("uses a fresh IV each time", () => {
    expect(encryptCredential("x")).not.toBe(encryptCredential("x"));
  });
  it("detects tampering", () => {
    const [iv, tag, ct] = encryptCredential("secret").split(":");
    const flipped = ct.slice(0, -1) + (ct.endsWith("0") ? "1" : "0");
    expect(() => decryptCredential(`${iv}:${tag}:${flipped}`)).toThrow();
    expect(decryptJson(`${iv}:${tag}:${flipped}`)).toBeNull();
  });
  it("masks account numbers", () => {
    expect(maskAccountNumber("88421098")).toBe("••••1098");
    expect(maskAccountNumber(undefined)).toBe("••••");
  });
});

describe("production env validation", () => {
  it("refuses to start without a strong key and password", () => {
    setEnv({ NODE_ENV: "production" });
    expect(() => getEnv()).toThrow(/PORTFOLIO_ENCRYPTION_KEY/);
  });
  it("rejects placeholder keys", () => {
    setEnv({ NODE_ENV: "production", PORTFOLIO_ENCRYPTION_KEY: "your-32-byte-secret-key-change-this-in-production!", APP_PASSWORD: "a-long-password-123" });
    expect(() => getEnv()).toThrow(/PORTFOLIO_ENCRYPTION_KEY/);
  });
  it("accepts a proper configuration", () => {
    setEnv({ NODE_ENV: "production", PORTFOLIO_ENCRYPTION_KEY: "k".repeat(24) + "Zx9!qW3#eR5$tY7&", APP_PASSWORD: "a-long-password-123" });
    expect(getEnv().NODE_ENV).toBe("production");
  });
  it("does not require secrets during next build", () => {
    setEnv({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" });
    expect(() => getEnv()).not.toThrow();
  });
});
