import "server-only";

import { decode } from "next-auth/jwt";

import { AUTH_SESSION_COOKIE_NAME } from "./cookie.mts";
import { isTrustedAppOrigin } from "./trusted-origin.mts";
import {
  createLinkedAccountsHandlers,
  type LinkedAccountsDependencies,
} from "./linked-accounts.mts";
import {
  getAuthenticatedOAuthSession,
  getOAuthSessionSummary,
  revokeOAuthSession,
} from "./session-store.mts";
import { getProfilePictureEntry } from "../profile/profile-picture-store.mts";
import { runJmapOAuthAccountLabel } from "../jmap/client.mts";
import { getJmapSettings } from "../jmap/settings.mts";

const LABEL_TIMEOUT_MS = 5_000;

const dependencies: LinkedAccountsDependencies = {
  authCookieName: AUTH_SESSION_COOKIE_NAME,
  async decodeSessionToken(token) {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET is required to read the application session.");
    const payload = await decode({ token, secret, salt: AUTH_SESSION_COOKIE_NAME });
    return typeof payload?.sid === "string" ? payload.sid : null;
  },
  getSessionSummary: getOAuthSessionSummary,
  revokeSession: revokeOAuthSession,
  async getAccountLabel(sessionId) {
    const session = await getAuthenticatedOAuthSession(sessionId);
    if (!session) return null;
    return runJmapOAuthAccountLabel({
      accessToken: session.accessToken,
      expectedAccountId: session.accountId,
      ...getJmapSettings(),
      fetchImpl: (input, init) => {
        const timeout = AbortSignal.timeout(LABEL_TIMEOUT_MS);
        return fetch(input, {
          ...init,
          signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
        });
      },
    });
  },
  getPictureEntry: getProfilePictureEntry,
  isTrustedOrigin: isTrustedAppOrigin,
};

export const linkedAccountsHandlers = createLinkedAccountsHandlers(dependencies);
