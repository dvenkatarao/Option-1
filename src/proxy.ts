import { NextResponse, type NextRequest } from "next/server";

/**
 * Access gate for the whole app (pages + API).
 *
 * The app has no user accounts, so it is protected by a single shared credential (HTTP Basic auth,
 * APP_USERNAME / APP_PASSWORD). In production a missing APP_PASSWORD makes every request fail
 * closed with 503 rather than silently exposing portfolio data to the internet.
 *
 * Also rejects cross-site state-changing requests (CSRF): browsers attach cached Basic credentials
 * to cross-site requests, so non-GET requests must come from the same origin. Failed Basic-auth
 * credentials are throttled per client IP; the process-local counter is not shared across replicas.
 */

const PUBLIC_PATHS = new Set(["/api/health"]);
const AUTH_FAILURE_LIMIT = 5;
const AUTH_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_AUTH_CLIENTS = 10_000;

type AuthFailureBucket = { windowStartedAt: number; failures: number; blockedUntil: number };
const authFailuresByClient = new Map<string, AuthFailureBucket>();

/**
 * The deployed edge proxy must overwrite X-Forwarded-For with the real client IP.
 * Do not trust client-supplied forwarding headers when exposing the app directly.
 */
function authClientKey(req: NextRequest): string {
  const forwardedAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwardedAddress || "unknown").slice(0, 128);
}

function retryAfterSeconds(clientKey: string, now = Date.now()): number {
  const bucket = authFailuresByClient.get(clientKey);
  if (!bucket) return 0;
  if (bucket.blockedUntil > now) return Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000));
  if (now - bucket.windowStartedAt >= AUTH_FAILURE_WINDOW_MS) authFailuresByClient.delete(clientKey);
  return 0;
}

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

/** Constant-time comparison (digests have equal length, so no length leak). */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="WheelCore Intelligence Terminal", charset="UTF-8"', "Cache-Control": "no-store" },
  });
}

function tooManyAuthFailures(retryAfter: number) {
  return new NextResponse("Too many failed login attempts. Try again later.", {
    status: 429,
    headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" },
  });
}

function failedAuthentication(clientKey: string) {
  const now = Date.now();
  let bucket = authFailuresByClient.get(clientKey);
  if (!bucket || now - bucket.windowStartedAt >= AUTH_FAILURE_WINDOW_MS || (bucket.blockedUntil > 0 && bucket.blockedUntil <= now)) {
    bucket = { windowStartedAt: now, failures: 0, blockedUntil: 0 };
  }
  bucket.failures += 1;
  if (bucket.failures >= AUTH_FAILURE_LIMIT) bucket.blockedUntil = now + AUTH_FAILURE_WINDOW_MS;

  if (!authFailuresByClient.has(clientKey) && authFailuresByClient.size >= MAX_TRACKED_AUTH_CLIENTS) {
    for (const [key, value] of authFailuresByClient) {
      if (value.blockedUntil <= now && now - value.windowStartedAt >= AUTH_FAILURE_WINDOW_MS) authFailuresByClient.delete(key);
    }
    if (authFailuresByClient.size >= MAX_TRACKED_AUTH_CLIENTS) {
      const oldestClient = authFailuresByClient.keys().next().value;
      if (oldestClient !== undefined) authFailuresByClient.delete(oldestClient);
    }
  }
  authFailuresByClient.set(clientKey, bucket);

  const retryAfter = retryAfterSeconds(clientKey, now);
  return retryAfter ? tooManyAuthFailures(retryAfter) : unauthorized();
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const clientKey = authClientKey(req);
  const retryAfter = retryAfterSeconds(clientKey);
  if (retryAfter) return tooManyAuthFailures(retryAfter);

  // CSRF: state-changing requests must be same-origin when the browser tells us the origin.
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        /* malformed origin -> rejected below */
      }
      if (!host || originHost !== host) {
        return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
      }
    }
  }

  const password = process.env.APP_PASSWORD;
  const username = process.env.APP_USERNAME || "admin";

  if (!password) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Service not configured: APP_PASSWORD is not set", { status: 503 });
    }
    return NextResponse.next(); // local development convenience
  }

  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return unauthorized();
  let decoded = "";
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0)));
  } catch {
    return failedAuthentication(clientKey);
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return failedAuthentication(clientKey);
  const [userOk, passOk] = await Promise.all([safeEqual(decoded.slice(0, sep), username), safeEqual(decoded.slice(sep + 1), password)]);
  if (!(userOk && passOk)) return failedAuthentication(clientKey);

  authFailuresByClient.delete(clientKey);
  return NextResponse.next();
}

export const config = {
  // Everything except Next's static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
