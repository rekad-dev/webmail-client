import {
  getAuthenticatedOAuthSession,
  revokeOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { isTrustedAppOrigin } from "@/lib/auth/trusted-origin.mts";
import {
  runJmapOAuthCreateDraft,
  runJmapOAuthDestroyDraft,
  runJmapOAuthReconcileSend,
  runJmapOAuthSubmitEmail,
  runJmapOAuthUpdateSent,
} from "@/lib/jmap/client.mts";
import { createMailSendPostHandler } from "@/lib/jmap/mail-send-route.mts";
import { getJmapSettings } from "@/lib/jmap/settings.mts";
import {
  getMailSendAttempt,
  reserveMailSendAttempt,
  transitionMailSendAttempt,
} from "@/lib/mail/send-attempt-store.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createMailSendPostHandler({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  revokeSession: revokeOAuthSession,
  isTrustedOrigin: isTrustedAppOrigin,
  getJmapSettings,
  reserveAttempt: reserveMailSendAttempt,
  getAttempt: getMailSendAttempt,
  transitionAttempt: transitionMailSendAttempt,
  createDraft: runJmapOAuthCreateDraft,
  submitEmail: runJmapOAuthSubmitEmail,
  updateSent: runJmapOAuthUpdateSent,
  reconcile: runJmapOAuthReconcileSend,
  destroyDraft: runJmapOAuthDestroyDraft,
});
