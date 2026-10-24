import {
  getAuthenticatedOAuthSession,
  revokeOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { isTrustedAppOrigin } from "@/lib/auth/trusted-origin.mts";
import { runJmapOAuthThreadSubjectCandidates } from "@/lib/jmap/client.mts";
import { createMailThreadSubjectCandidatesPostHandler } from "@/lib/jmap/mail-thread-subject-candidates-route.mts";
import { getJmapSettings } from "@/lib/jmap/settings.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createMailThreadSubjectCandidatesPostHandler({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  revokeSession: revokeOAuthSession,
  getSubjectCandidates: runJmapOAuthThreadSubjectCandidates,
  isTrustedOrigin: isTrustedAppOrigin,
  getJmapSettings,
});
