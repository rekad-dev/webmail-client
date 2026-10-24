import {
  getAuthenticatedOAuthSession,
  revokeOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { runJmapOAuthThreadSubjects } from "@/lib/jmap/client.mts";
import { createMailThreadSubjectsGetHandler } from "@/lib/jmap/mail-thread-subjects-route.mts";
import { getJmapSettings } from "@/lib/jmap/settings.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createMailThreadSubjectsGetHandler({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  revokeSession: revokeOAuthSession,
  getThreadSubjects: runJmapOAuthThreadSubjects,
  getJmapSettings,
});
