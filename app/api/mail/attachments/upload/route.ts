import {
  getAuthenticatedOAuthSession,
  revokeOAuthSession,
} from "@/lib/auth/session-store.mts";
import { getRequestOAuthSessionId } from "@/lib/auth/request-session.mts";
import { isTrustedAppOrigin } from "@/lib/auth/trusted-origin.mts";
import { runJmapOAuthUploadAttachment } from "@/lib/jmap/client.mts";
import { createMailAttachmentReceipt } from "@/lib/jmap/mail-attachment-receipt.mts";
import { createMailAttachmentUploadHandler } from "@/lib/jmap/mail-attachment-upload-route.mts";
import { getJmapSettings } from "@/lib/jmap/settings.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

function attachmentReceiptSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is unavailable.");
  return secret;
}

export const POST = createMailAttachmentUploadHandler({
  getSessionId: getRequestOAuthSessionId,
  getAuthenticatedSession: getAuthenticatedOAuthSession,
  revokeSession: revokeOAuthSession,
  uploadAttachment: runJmapOAuthUploadAttachment,
  createReceipt(accountId, attachment) {
    return createMailAttachmentReceipt(accountId, attachment, attachmentReceiptSecret());
  },
  getJmapSettings,
  isTrustedOrigin: isTrustedAppOrigin,
});
