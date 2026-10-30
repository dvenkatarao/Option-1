import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const basic = (u: string, p: string) => "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
let nextTestClient = 1;
const req = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) => {
  const headers = init.headers ?? {};
  const clientIp = headers["x-forwarded-for"] ?? `192.0.2.${nextTestClient++}`;
  return new NextRequest(`http://app.test${path}`, {
    method: init.method,
    headers: { host: "app.test", "x-forwarded-for": clientIp, ...headers },
  });
};

afterEach(() => {
  delete process.env.APP_PASSWORD;
  delete process.env.APP_USERNAME;
  (process.env as Record<string, string>).NODE_ENV = "test";
});

describe("access gate", () => {
  it("requires credentials when a password is configured", async () => {
    process.env.APP_PASSWORD = "correct-horse-battery";
    expect((await proxy(req("/portfolio"))).status).toBe(401);
    expect((await proxy(req("/portfolio", { headers: { authorization: basic("admin", "wrong") } }))).status).toBe(401);
    expect((await proxy(req("/portfolio", { headers: { authorization: basic("admin", "correct-horse-battery") } }))).status).toBe(200);
  });
  it("honours APP_USERNAME", async () => {
    process.env.APP_PASSWORD = "correct-horse-battery";
    process.env.APP_USERNAME = "ven";
    expect((await proxy(req("/api/portfolios", { headers: { authorization: basic("admin", "correct-horse-battery") } }))).status).toBe(401);
    expect((await proxy(req("/api/portfolios", { headers: { authorization: basic("ven", "correct-horse-battery") } }))).status).toBe(200);
  });
  it("throttles repeated invalid Basic credentials by client IP and allows public health checks", async () => {
    process.env.APP_PASSWORD = "correct-horse-battery";
    const clientIp = "203.0.113.77";
    const badAuth = { authorization: basic("admin", "wrong"), "x-forwarded-for": clientIp };
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await proxy(req("/portfolio", { headers: badAuth }))).status).toBe(401);
    }

    const limited = await proxy(req("/portfolio", { headers: badAuth }));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await proxy(req("/portfolio", { headers: { authorization: basic("admin", "correct-horse-battery"), "x-forwarded-for": clientIp } }))).status).toBe(429);
    expect((await proxy(req("/api/health", { headers: { "x-forwarded-for": clientIp } }))).status).toBe(200);
  });

  it("clears an IP failure counter after successful authentication", async () => {
    process.env.APP_PASSWORD = "correct-horse-battery";
    const clientIp = "203.0.113.78";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await proxy(req("/portfolio", { headers: { authorization: basic("admin", "wrong"), "x-forwarded-for": clientIp } }))).status).toBe(401);
    }
    expect((await proxy(req("/portfolio", { headers: { authorization: basic("admin", "correct-horse-battery"), "x-forwarded-for": clientIp } }))).status).toBe(200);
    expect((await proxy(req("/portfolio", { headers: { authorization: basic("admin", "wrong"), "x-forwarded-for": clientIp } }))).status).toBe(401);
  });

  it("fails closed in production without a password", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect((await proxy(req("/portfolio"))).status).toBe(503);
  });
  it("leaves the health probe public", async () => {
    process.env.APP_PASSWORD = "correct-horse-battery";
    expect((await proxy(req("/api/health"))).status).toBe(200);
  });
  it("blocks cross-origin state-changing requests", async () => {
    process.env.APP_PASSWORD = "correct-horse-battery";
    const auth = basic("admin", "correct-horse-battery");
    const evil = await proxy(req("/api/portfolios", { method: "POST", headers: { authorization: auth, origin: "https://evil.example" } }));
    expect(evil.status).toBe(403);
    const ok = await proxy(req("/api/portfolios", { method: "POST", headers: { authorization: auth, origin: "http://app.test" } }));
    expect(ok.status).toBe(200);
  });
});
