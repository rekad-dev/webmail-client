import {
  getAuthenticatedOAuthSession,
  revokeOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { runJmapOAuthDownloadAttachment } from "@/lib/jmap/client.mts";
import { createMailAttachmentDownloadHandler } from "@/lib/jmap/mail-attachment-download-route.mts";
import { getJmapSettings } from "@/lib/jmap/settings.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

export const GET = createMailAttachmentDownloadHandler({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  revokeSession: revokeOAuthSession,
  downloadAttachment: runJmapOAuthDownloadAttachment,
  getJmapSettings,
});
