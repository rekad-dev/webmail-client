import {
  getAuthenticatedOAuthSession,
  revokeOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { isTrustedAppOrigin } from "@/lib/auth/trusted-origin.mts";
import { createOfflineCacheScope } from "@/lib/auth/offline-cache-scope.mts";
import { runJmapOAuthOfflineSync } from "@/lib/jmap/client.mts";
import { createOfflineSyncPostHandler } from "@/lib/jmap/mail-offline-sync-route.mts";
import { getJmapSettings } from "@/lib/jmap/settings.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const handler = createOfflineSyncPostHandler({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  revokeSession: revokeOAuthSession,
  sync: runJmapOAuthOfflineSync,
  getCacheScope(accountId) {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET is unavailable.");
    return createOfflineCacheScope(accountId, secret);
  },
  getJmapSettings,
  isTrustedOrigin: isTrustedAppOrigin,
});

export const POST = handler;
