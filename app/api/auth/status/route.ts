import {
  getAuthenticatedOAuthSession,
  revokeOAuthSession,
} from "@/lib/auth/session-store.mts";
import { accountHandleMismatch } from "@/lib/auth/account-handle.mts";
import { readCookieOAuthSessionId } from "@/lib/auth/request-session.mts";
import { AUTH_SESSION_COOKIE_NAME } from "@/lib/auth/cookie.mts";
import { readCookie, serializeCookie } from "@/lib/auth/linked-accounts.mts";
import { runJmapOAuthAccessCheck } from "@/lib/jmap/client.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
};

function jsonResponse(
  body: Record<string, boolean | string>,
  status: number,
): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const sessionId = await readCookieOAuthSessionId(request);
    if (!sessionId) {
      return jsonResponse({ authenticated: false }, 401);
    }
    // The tab was loaded for another account; it must reload, not sign anyone out.
    if (accountHandleMismatch(request, sessionId)) {
      return jsonResponse({ authenticated: true, error: "account_changed" }, 409);
    }

    const session = await getAuthenticatedOAuthSession(sessionId);
    if (!session) {
      return jsonResponse({ authenticated: false }, 401);
    }

    const result = await runJmapOAuthAccessCheck({
      accessToken: session.accessToken,
      sessionUrl:
        process.env.STALWART_JMAP_SESSION_URL ??
        "https://mail.rekad.id/.well-known/jmap",
      trustedOrigins: (process.env.STALWART_JMAP_TRUSTED_ORIGINS ??
        "https://mail.rekad.id")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
      allowInsecureHttp:
        process.env.STALWART_JMAP_ALLOW_INSECURE_HTTP === "true",
    });

    if (result.accountId !== session.accountId) {
      await revokeOAuthSession(sessionId);
      return jsonResponse(
        {
          authenticated: false,
          error: "The Stalwart account did not match this session.",
        },
        401,
      );
    }

    const response = jsonResponse(
      { authenticated: true, mailboxAccess: true },
      200,
    );
    // Using the app also keeps the browser's copy of the session cookie alive for as long as the server session.
    const token = readCookie(request, AUTH_SESSION_COOKIE_NAME);
    const secondsLeft = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
    if (token && secondsLeft > 0) {
      response.headers.append("Set-Cookie", serializeCookie(AUTH_SESSION_COOKIE_NAME, token, secondsLeft));
    }
    return response;
  } catch {
    return jsonResponse(
      {
        authenticated: false,
        error: "Authentication or Stalwart access is temporarily unavailable.",
      },
      503,
    );
  }
}
