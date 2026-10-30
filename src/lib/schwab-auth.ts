import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { marketDataConnections } from "@/db/schema";
import { decryptJson, encryptCredential } from "@/lib/security";

const SCHWAB_AUTHORIZE_URL = "https://api.schwabapi.com/v1/oauth/authorize";
const SCHWAB_TOKEN_URL = "https://api.schwabapi.com/v1/oauth/token";
export const SCHWAB_CALLBACK_PATH = "/api/v1/auth/callback";
export const SCHWAB_STATE_COOKIE = "schwab_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TOKEN_SKEW_MS = 60 * 1000;
const CONNECTION_ID = "schwab";

type SchwabConfig = { clientId: string; clientSecret: string; redirectUri: string };

type StoredSchwabTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number | null;
  reauthRequired?: boolean;
};

type SchwabTokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  refresh_token_expires_in?: unknown;
};

let refreshInFlight: Promise<string> | null = null;

function rawConfig() {
  return {
    clientId: process.env.SCHWAB_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.SCHWAB_CLIENT_SECRET?.trim() ?? "",
    redirectUri: process.env.SCHWAB_REDIRECT_URI?.trim() ?? "",
    encryptionKey: process.env.PORTFOLIO_ENCRYPTION_KEY?.trim() ?? "",
  };
}

function configProblem(): string | null {
  const config = rawConfig();
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    return "Set SCHWAB_CLIENT_ID, SCHWAB_CLIENT_SECRET, and SCHWAB_REDIRECT_URI on the server.";
  }
  if (config.encryptionKey.length < 32 || /example\.com|dev-only|change[-_ ]this|your[-_ ]/i.test(config.encryptionKey)) {
    return "Set a private PORTFOLIO_ENCRYPTION_KEY of at least 32 characters before connecting Schwab.";
  }
  let redirect: URL;
  try {
    redirect = new URL(config.redirectUri);
  } catch {
    return "SCHWAB_REDIRECT_URI must be a valid absolute URL.";
  }
  if (!["http:", "https:"].includes(redirect.protocol) || redirect.username || redirect.password) {
    return "SCHWAB_REDIRECT_URI must use an HTTP(S) URL without embedded credentials.";
  }
  if (redirect.pathname !== SCHWAB_CALLBACK_PATH || redirect.search || redirect.hash) {
    return `SCHWAB_REDIRECT_URI must use the ${SCHWAB_CALLBACK_PATH} callback path without a query or fragment.`;
  }
  if (process.env.NODE_ENV === "production" && redirect.protocol !== "https:") {
    return "SCHWAB_REDIRECT_URI must use HTTPS in production.";
  }
  return null;
}

function requireConfig(): SchwabConfig {
  const problem = configProblem();
  if (problem) throw new Error(problem);
  const config = rawConfig();
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri };
}

export function schwabMarketDataConfigured(): boolean {
  return configProblem() == null;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function stateSignature(payload: string): string {
  const secret = rawConfig().encryptionKey;
  if (secret.length < 32) throw new Error("A strong PORTFOLIO_ENCRYPTION_KEY is required for Schwab OAuth.");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** State is signed and bound to an HttpOnly SameSite cookie to protect the OAuth callback from CSRF. */
export function createSchwabOAuthState(now = Date.now()): { state: string; cookieValue: string } {
  const state = randomBytes(32).toString("base64url");
  const issuedAt = String(now);
  const payload = `${issuedAt}.${state}`;
  return { state, cookieValue: `${payload}.${stateSignature(payload)}` };
}

export function verifySchwabOAuthState(cookieValue: string, returnedState: string, now = Date.now()): boolean {
  const [issuedAtRaw, cookieState, suppliedSignature, ...extra] = cookieValue.split(".");
  if (!issuedAtRaw || !cookieState || !suppliedSignature || extra.length) return false;
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isSafeInteger(issuedAt) || issuedAt > now || now - issuedAt > STATE_TTL_MS) return false;
  const payload = `${issuedAtRaw}.${cookieState}`;
  let expectedSignature: string;
  try {
    expectedSignature = stateSignature(payload);
  } catch {
    return false;
  }
  return safeEqual(suppliedSignature, expectedSignature) && safeEqual(cookieState, returnedState);
}

export function schwabAuthorizationUrl(state: string): string {
  const config = requireConfig();
  const url = new URL(SCHWAB_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

function tokenExpiry(value: unknown): number {
  const seconds = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("Schwab token response omitted a valid expires_in value.");
  return Date.now() + seconds * 1000;
}

async function requestToken(form: URLSearchParams): Promise<SchwabTokenResponse> {
  const config = requireConfig();
  let response: Response;
  try {
    response = await fetch(SCHWAB_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    // Do not automatically retry token exchanges: a refresh token may already have rotated upstream.
    throw new Error("Schwab OAuth token request failed or timed out. Reconnect Schwab if the connection remains unavailable.");
  }
  if (!response.ok) throw new Error(`Schwab OAuth token request failed (HTTP ${response.status}). Reconnect Schwab if authorization expired.`);
  try {
    return await response.json() as SchwabTokenResponse;
  } catch {
    throw new Error("Schwab OAuth returned an unreadable token response.");
  }
}

function tokensFromResponse(response: SchwabTokenResponse, previous?: StoredSchwabTokens): StoredSchwabTokens {
  const accessToken = typeof response.access_token === "string" ? response.access_token : "";
  const rotatedRefreshToken = typeof response.refresh_token === "string" ? response.refresh_token : "";
  // Store every rotated token returned; some compatible responses omit refresh_token when it did not rotate.
  const refreshToken = rotatedRefreshToken || previous?.refreshToken || "";
  if (!accessToken || !refreshToken) throw new Error("Schwab OAuth response did not include the required tokens.");
  const refreshExpirySeconds = typeof response.refresh_token_expires_in === "number"
    ? response.refresh_token_expires_in
    : typeof response.refresh_token_expires_in === "string"
      ? Number(response.refresh_token_expires_in)
      : NaN;
  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: tokenExpiry(response.expires_in),
    refreshTokenExpiresAt: Number.isFinite(refreshExpirySeconds) && refreshExpirySeconds > 0
      ? Date.now() + refreshExpirySeconds * 1000
      : previous?.refreshTokenExpiresAt ?? null,
  };
}

async function saveTokens(tokens: StoredSchwabTokens, executor: typeof db = db): Promise<void> {
  const encryptedTokens = encryptCredential(tokens);
  await executor.insert(marketDataConnections).values({
    provider: CONNECTION_ID,
    encryptedTokens,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: marketDataConnections.provider,
    set: { encryptedTokens, updatedAt: new Date() },
  });
}

async function loadTokens(executor: typeof db = db): Promise<StoredSchwabTokens | null> {
  const rows = await executor.select().from(marketDataConnections).where(eq(marketDataConnections.provider, CONNECTION_ID)).limit(1);
  const tokens = decryptJson<StoredSchwabTokens>(rows[0]?.encryptedTokens);
  if (!tokens || typeof tokens.accessToken !== "string" || typeof tokens.refreshToken !== "string") return null;
  return tokens;
}

export async function completeSchwabAuthorization(code: string): Promise<void> {
  const config = requireConfig();
  const form = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: config.redirectUri });
  const response = await requestToken(form);
  const tokens = tokensFromResponse(response);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(731904, 1)`);
    await saveTokens(tokens, tx as unknown as typeof db);
  });
}

export async function hasStoredSchwabConnection(): Promise<boolean> {
  if (!schwabMarketDataConfigured()) return false;
  try {
    const tokens = await loadTokens();
    const refreshExpired = tokens?.refreshTokenExpiresAt != null && tokens.refreshTokenExpiresAt <= Date.now();
    return !!tokens?.refreshToken && !tokens.reauthRequired && !refreshExpired;
  } catch {
    return false;
  }
}

export async function getSchwabConnectionStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  reauthRequired: boolean;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  setupMessage: string | null;
}> {
  const setupMessage = configProblem();
  if (setupMessage) {
    return { configured: false, connected: false, reauthRequired: false, accessTokenExpiresAt: null, refreshTokenExpiresAt: null, setupMessage };
  }
  try {
    const tokens = await loadTokens();
    const expiredRefresh = tokens?.refreshTokenExpiresAt != null && tokens.refreshTokenExpiresAt <= Date.now();
    const reauthRequired = !!tokens?.reauthRequired || expiredRefresh;
    return {
      configured: true,
      connected: !!tokens && !reauthRequired,
      reauthRequired,
      accessTokenExpiresAt: tokens ? new Date(tokens.accessTokenExpiresAt).toISOString() : null,
      refreshTokenExpiresAt: tokens?.refreshTokenExpiresAt ? new Date(tokens.refreshTokenExpiresAt).toISOString() : null,
      setupMessage: null,
    };
  } catch {
    return { configured: true, connected: false, reauthRequired: false, accessTokenExpiresAt: null, refreshTokenExpiresAt: null, setupMessage: "Schwab connection status is temporarily unavailable." };
  }
}

export async function disconnectSchwab(): Promise<void> {
  await db.transaction(async (tx) => {
    // Serialize with refresh so a request already rotating tokens cannot recreate a disconnected row.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(731904, 1)`);
    await tx.delete(marketDataConnections).where(eq(marketDataConnections.provider, CONNECTION_ID));
  });
}

async function refreshSchwabToken(): Promise<string> {
  let attemptedRefreshToken: string | null = null;
  try {
    return await db.transaction(async (tx) => {
      // Serialize token rotation across requests and app replicas. Refresh tokens may be single-use.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(731904, 1)`);
      const tokens = await loadTokens(tx as unknown as typeof db);
      if (!tokens || !tokens.refreshToken || tokens.reauthRequired) throw new Error("Schwab must be reconnected before options can be fetched.");
      const now = Date.now();
      if (tokens.accessTokenExpiresAt > now + ACCESS_TOKEN_SKEW_MS) return tokens.accessToken;
      if (tokens.refreshTokenExpiresAt != null && tokens.refreshTokenExpiresAt <= now) {
        throw new Error("Schwab authorization expired. Reconnect Schwab to continue using its market data.");
      }

      attemptedRefreshToken = tokens.refreshToken;
      const response = await requestToken(new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refreshToken }));
      const nextTokens = tokensFromResponse(response, tokens);
      await saveTokens(nextTokens, tx as unknown as typeof db);
      return nextTokens.accessToken;
    });
  } catch (error) {
    if (attemptedRefreshToken) {
      // A timeout can happen after Schwab has rotated the token. Do not retry a potentially spent token.
      // Re-read under the same lock so a concurrent successful browser reauthorization is never overwritten.
      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(731904, 1)`);
          const tokens = await loadTokens(tx as unknown as typeof db);
          if (tokens?.refreshToken === attemptedRefreshToken) {
            await saveTokens({ ...tokens, reauthRequired: true }, tx as unknown as typeof db);
          }
        });
      } catch {
        /* Keep the provider error safe; the next status check can still report a connection issue. */
      }
      throw new Error("Schwab token refresh failed. Reconnect Schwab before using its market data.");
    }
    throw error;
  }
}

export async function getSchwabAccessToken(): Promise<string> {
  const configError = configProblem();
  if (configError) throw new Error(configError);
  if (refreshInFlight) return refreshInFlight;
  const tokens = await loadTokens();
  if (!tokens || !tokens.refreshToken || tokens.reauthRequired) throw new Error("Schwab is not connected. Connect Schwab market data first.");
  const now = Date.now();
  if (tokens.refreshTokenExpiresAt != null && tokens.refreshTokenExpiresAt <= now) {
    throw new Error("Schwab authorization expired. Reconnect Schwab to continue using its market data.");
  }
  if (tokens.accessTokenExpiresAt > now + ACCESS_TOKEN_SKEW_MS) return tokens.accessToken;

  refreshInFlight = refreshSchwabToken();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}
