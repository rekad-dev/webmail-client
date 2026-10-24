import {
  getAuthenticatedOAuthSession,
  revokeOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { isTrustedAppOrigin } from "@/lib/auth/trusted-origin.mts";
import {
  runJmapOAuthEmailDetail,
  runJmapOAuthMarkEmailRead,
} from "@/lib/jmap/client.mts";
import { createMailDetailHandlers } from "@/lib/jmap/mail-detail-route.mts";
import { getJmapSettings } from "@/lib/jmap/settings.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = createMailDetailHandlers({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  revokeSession: revokeOAuthSession,
  getEmailDetail: runJmapOAuthEmailDetail,
  markEmailRead: runJmapOAuthMarkEmailRead,
  getJmapSettings,
  isTrustedOrigin: isTrustedAppOrigin,
});

export const GET = handlers.GET;
export const POST = handlers.POST;
