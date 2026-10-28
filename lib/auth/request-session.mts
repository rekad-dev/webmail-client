import "server-only";

import { getToken } from "next-auth/jwt";

import { accountHandleMismatch } from "./account-handle.mts";
import { AUTH_SESSION_COOKIE_NAME } from "./cookie.mts";

/** The session id in the request's cookie, ignoring any account claim in the headers. */
export async function readCookieOAuthSessionId(
  request: Request,
): Promise<string | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required to read the application session.");
  }

  const token = await getToken({
    req: request,
    secret,
    cookieName: AUTH_SESSION_COOKIE_NAME,
    secureCookie: process.env.NODE_ENV === "production",
  });
  return typeof token?.sid === "string" ? token.sid : null;
}

/**
 * The session id for a request. A request that names another account than the
 * cookie holds (a tab left open across an account switch) gets no session, so
 * it can never act as the newly selected account.
 */
export async function getRequestOAuthSessionId(
  request: Request,
): Promise<string | null> {
  const sessionId = await readCookieOAuthSessionId(request);
  if (sessionId && accountHandleMismatch(request, sessionId)) return null;
  return sessionId;
}
