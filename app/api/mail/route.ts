import {
  getAuthenticatedOAuthSession,
  revokeOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { runJmapOAuthMailboxListing } from "@/lib/jmap/client.mts";
import { createMailGetHandler } from "@/lib/jmap/mail-route.mts";
import { getJmapSettings } from "@/lib/jmap/settings.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createMailGetHandler({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  revokeSession: revokeOAuthSession,
  listMail: runJmapOAuthMailboxListing,
  getJmapSettings,
});
