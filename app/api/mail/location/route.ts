import {
  getAuthenticatedOAuthSession,
  revokeOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { runJmapOAuthEmailMailboxMembership } from "@/lib/jmap/client.mts";
import { createMailMembershipGetHandler } from "@/lib/jmap/mail-membership-route.mts";
import { getJmapSettings } from "@/lib/jmap/settings.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createMailMembershipGetHandler({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  revokeSession: revokeOAuthSession,
  getMembership: runJmapOAuthEmailMailboxMembership,
  getJmapSettings,
});
