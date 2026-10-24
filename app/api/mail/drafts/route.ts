import {
  getAuthenticatedOAuthSession,
  revokeOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { isTrustedAppOrigin } from "@/lib/auth/trusted-origin.mts";
import {
  runJmapOAuthGetDraft,
  runJmapOAuthSaveDraft,
} from "@/lib/jmap/client.mts";
import { createMailDraftHandlers } from "@/lib/jmap/mail-draft-route.mts";
import { getJmapSettings } from "@/lib/jmap/settings.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = createMailDraftHandlers({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  revokeSession: revokeOAuthSession,
  isTrustedOrigin: isTrustedAppOrigin,
  getJmapSettings,
  getDraft: runJmapOAuthGetDraft,
  saveDraft: runJmapOAuthSaveDraft,
});

export const GET = handlers.GET;
export const POST = handlers.POST;
