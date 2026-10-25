import {
  JmapAccountMismatchError,
  JmapAttachmentTooLargeError,
  JmapEmailNotFoundError,
} from "./client.mts";
import { sanitizeAttachmentName } from "./mail-attachment-request.mts";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

type DownloadOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthDownloadAttachment
>[0];

export interface MailAttachmentDownloadSession {
  accessToken: string;
  accountId: string;
}

export interface MailAttachmentDownloadDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(sessionId: string): Promise<MailAttachmentDownloadSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  downloadAttachment(options: DownloadOptions): Promise<{
    bytes: Uint8Array;
    name: string;
    size: number;
  }>;
  getJmapSettings(): Pick<
    DownloadOptions,
    "sessionUrl" | "trustedOrigins" | "allowInsecureHttp"
  >;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

function readDownloadRequest(request: Request): {
  emailId: string;
  attachmentIndex: number;
} | null {
  const url = new URL(request.url);
  const emailIds = url.searchParams.getAll("emailId");
  const indexes = url.searchParams.getAll("attachmentIndex");
  const emailId = emailIds[0];
  const rawIndex = indexes[0];
  if (
    emailIds.length !== 1 ||
    !emailId ||
    emailId.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(emailId) ||
    indexes.length !== 1 ||
    !rawIndex ||
    !/^\d{1,2}$/.test(rawIndex)
  ) {
    return null;
  }
  const attachmentIndex = Number(rawIndex);
  if (!Number.isSafeInteger(attachmentIndex) || attachmentIndex > 49) return null;
  return { emailId, attachmentIndex };
}

function encodeFileName(value: string): string {
  return encodeURIComponent(sanitizeAttachmentName(value))
    .replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
}

export function createMailAttachmentDownloadHandler(
  dependencies: MailAttachmentDownloadDependencies,
) {
  return async function GET(request: Request): Promise<Response> {
    const input = readDownloadRequest(request);
    if (!input) return jsonResponse({ error: "invalid_request" }, 400);

    let sessionId: string | null;
    let session: MailAttachmentDownloadSession | null;
    try {
      sessionId = await dependencies.getSessionId(request);
      if (!sessionId) return jsonResponse({ error: "sign_in_required" }, 401);
      session = await dependencies.getAuthenticatedSession(sessionId);
      if (!session) return jsonResponse({ error: "sign_in_required" }, 401);
    } catch {
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }

    try {
      const attachment = await dependencies.downloadAttachment({
        accessToken: session.accessToken,
        expectedAccountId: session.accountId,
        ...input,
        ...dependencies.getJmapSettings(),
      });
      const headers = new Headers(RESPONSE_HEADERS);
      headers.set("Content-Type", "application/octet-stream");
      headers.set("Content-Length", String(attachment.bytes.byteLength));
      headers.set(
        "Content-Disposition",
        `attachment; filename="attachment"; filename*=UTF-8''${encodeFileName(attachment.name)}`,
      );
      return new Response(new Uint8Array(attachment.bytes).buffer, {
        status: 200,
        headers,
      });
    } catch (error) {
      if (error instanceof JmapAccountMismatchError) {
        try {
          await dependencies.revokeSession(sessionId);
        } catch {
          return jsonResponse({ error: "mail_unavailable" }, 503);
        }
        return jsonResponse({ error: "sign_in_required" }, 401);
      }
      if (error instanceof JmapEmailNotFoundError) {
        return jsonResponse({ error: "attachment_not_found" }, 404);
      }
      if (error instanceof JmapAttachmentTooLargeError) {
        return jsonResponse({ error: "attachment_too_large" }, 413);
      }
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }
  };
}
