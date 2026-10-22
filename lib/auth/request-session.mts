import "server-only";

import { getToken } from "next-auth/jwt";

import { AUTH_SESSION_COOKIE_NAME } from "./cookie.mts";

export async function getRequestOAuthSessionId(
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
