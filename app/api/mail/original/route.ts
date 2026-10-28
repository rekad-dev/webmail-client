import {
  getAuthenticatedOAuthSession,
  revokeOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { runJmapOAuthRawMessage } from "@/lib/jmap/client.mts";
import { createMailOriginalHandler } from "@/lib/jmap/mail-original-route.mts";
import { getJmapSettings } from "@/lib/jmap/settings.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

export const GET = createMailOriginalHandler({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  revokeSession: revokeOAuthSession,
  getRawMessage: runJmapOAuthRawMessage,
  getJmapSettings,
});
