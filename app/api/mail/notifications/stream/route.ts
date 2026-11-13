import {
  getAuthenticatedOAuthSession,
  revokeOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { isTrustedAppOrigin } from "@/lib/auth/trusted-origin.mts";
import { openJmapOAuthEventStream } from "@/lib/jmap/client.mts";
import { createMailNotificationStreamGetHandler } from "@/lib/jmap/mail-notification-stream-route.mts";
import { getJmapSettings } from "@/lib/jmap/settings.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = createMailNotificationStreamGetHandler({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  revokeSession: revokeOAuthSession,
  openEventStream: openJmapOAuthEventStream,
  getJmapSettings,
  isTrustedOrigin: isTrustedAppOrigin,
});

export const GET = handler;
