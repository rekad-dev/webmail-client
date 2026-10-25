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

function attachmentReceiptSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is unavailable.");
  return secret;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = createMailDraftHandlers({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  revokeSession: revokeOAuthSession,
  isTrustedOrigin: isTrustedAppOrigin,
  getJmapSettings,
  getDraft: (options) => runJmapOAuthGetDraft({
    ...options,
    attachmentReceiptSecret: attachmentReceiptSecret(),
  }),
  saveDraft: (options) => runJmapOAuthSaveDraft({
    ...options,
    attachmentReceiptSecret: attachmentReceiptSecret(),
  }),
});

export const GET = handlers.GET;
export const POST = handlers.POST;
