import { NextRequest, NextResponse } from "next/server";
import { completeSchwabAuthorization, SCHWAB_STATE_COOKIE, verifySchwabOAuthState } from "@/lib/schwab-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function finish(request: NextRequest, status: "connected" | "error") {
  const response = NextResponse.redirect(new URL(`/?schwab=${status}`, request.url));
  response.cookies.set(SCHWAB_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const stateCookie = request.cookies.get(SCHWAB_STATE_COOKIE)?.value ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!stateCookie || !state || !verifySchwabOAuthState(stateCookie, state)) {
    return finish(request, "error");
  }

  // A provider-declined or malformed response is intentionally reported without echoing provider data.
  if (url.searchParams.has("error") || url.searchParams.has("error_description")) {
    return finish(request, "error");
  }
  const code = url.searchParams.get("code") ?? "";
  if (!code || code.length > 4096) return finish(request, "error");

  try {
    await completeSchwabAuthorization(code);
    return finish(request, "connected");
  } catch (error) {
    console.error("[schwab] OAuth callback failed:", error instanceof Error ? error.message : "unknown error");
    return finish(request, "error");
  }
}
