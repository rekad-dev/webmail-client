import {
  getAuthenticatedOAuthSession,
  revokeOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { isTrustedAppOrigin } from "@/lib/auth/trusted-origin.mts";
import { runJmapOAuthSubjectMatchMetadata } from "@/lib/jmap/client.mts";
import { createMailSubjectMetadataPostHandler } from "@/lib/jmap/mail-subject-metadata-route.mts";
import { getJmapSettings } from "@/lib/jmap/settings.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createMailSubjectMetadataPostHandler({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  revokeSession: revokeOAuthSession,
  getSubjectMetadata: runJmapOAuthSubjectMatchMetadata,
  isTrustedOrigin: isTrustedAppOrigin,
  getJmapSettings,
});
