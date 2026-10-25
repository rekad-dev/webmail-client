import {
  getAuthenticatedOAuthSession,
  revokeOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { isTrustedAppOrigin } from "@/lib/auth/trusted-origin.mts";
import { runJmapOAuthPasswordChange } from "@/lib/jmap/client.mts";
import { createMailPasswordChangePostHandler } from "@/lib/jmap/mail-password-change-route.mts";
import { getJmapSettings } from "@/lib/jmap/settings.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = createMailPasswordChangePostHandler({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  revokeSession: revokeOAuthSession,
  isTrustedOrigin: isTrustedAppOrigin,
  getJmapSettings,
  changePassword: runJmapOAuthPasswordChange,
});
