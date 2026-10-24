import {
  getAuthenticatedOAuthSession,
  revokeOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { isTrustedAppOrigin } from "@/lib/auth/trusted-origin.mts";
import { runJmapOAuthThreadSubjects } from "@/lib/jmap/client.mts";
import { createMailThreadSubjectsPostHandler } from "@/lib/jmap/mail-thread-subjects-route.mts";
import { getJmapSettings } from "@/lib/jmap/settings.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createMailThreadSubjectsPostHandler({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  revokeSession: revokeOAuthSession,
  getThreadSubjects: runJmapOAuthThreadSubjects,
  isTrustedOrigin: isTrustedAppOrigin,
  getJmapSettings,
});
