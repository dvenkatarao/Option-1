import { NextResponse } from "next/server";
import { createSchwabOAuthState, schwabAuthorizationUrl, SCHWAB_STATE_COOKIE } from "@/lib/schwab-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const { state, cookieValue } = createSchwabOAuthState();
    const response = NextResponse.redirect(schwabAuthorizationUrl(state));
    response.cookies.set(SCHWAB_STATE_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Schwab connection could not be started.";
    return Response.json({ error: message }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
