import {
  JmapAccountMismatchError,
  JmapAttachmentTooLargeError,
  JmapSendRejectedError,
} from "./client.mts";
import {
  InvalidMailAttachmentRequest,
  OversizedMailAttachmentRequest,
  parseMailAttachmentUploadRequest,
} from "./mail-attachment-request.mts";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

type UploadOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthUploadAttachment
>[0];

export interface MailAttachmentUploadSession {
  accessToken: string;
  accountId: string;
}

export interface MailAttachmentUploadDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(sessionId: string): Promise<MailAttachmentUploadSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  uploadAttachment(options: UploadOptions): Promise<{
    blobId: string;
    type: string;
    size: number;
  }>;
  createReceipt(
    accountId: string,
    attachment: { blobId: string; type: string; size: number },
  ): string;
  getJmapSettings(): Pick<
    UploadOptions,
    "sessionUrl" | "trustedOrigins" | "allowInsecureHttp"
  >;
  isTrustedOrigin(request: Request): boolean;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

export function createMailAttachmentUploadHandler(
  dependencies: MailAttachmentUploadDependencies,
) {
  return async function POST(request: Request): Promise<Response> {
    if (!dependencies.isTrustedOrigin(request)) {
      return jsonResponse({ error: "origin_not_allowed" }, 403);
    }
    let sessionId: string | null;
    try {
      sessionId = await dependencies.getSessionId(request);
    } catch {
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }
    if (!sessionId) return jsonResponse({ error: "sign_in_required" }, 401);
    let session: MailAttachmentUploadSession | null;
    try {
      session = await dependencies.getAuthenticatedSession(sessionId);
    } catch {
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }
    if (!session) return jsonResponse({ error: "sign_in_required" }, 401);

    let input: Awaited<ReturnType<typeof parseMailAttachmentUploadRequest>>;
    try {
      input = await parseMailAttachmentUploadRequest(request);
    } catch (error) {
      if (error instanceof OversizedMailAttachmentRequest) {
        return jsonResponse({ error: "attachment_too_large" }, 413);
      }
      if (error instanceof InvalidMailAttachmentRequest) {
        return jsonResponse({ error: "invalid_request" }, 400);
      }
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }

    try {
      const uploaded = await dependencies.uploadAttachment({
        accessToken: session.accessToken,
        expectedAccountId: session.accountId,
        bytes: input.bytes,
        type: input.type,
        ...dependencies.getJmapSettings(),
      });
      return jsonResponse({
        ...uploaded,
        blobId: dependencies.createReceipt(session.accountId, uploaded),
      }, 201);
    } catch (error) {
      if (error instanceof JmapAccountMismatchError) {
        try {
          await dependencies.revokeSession(sessionId);
        } catch {
          return jsonResponse({ error: "mail_unavailable" }, 503);
        }
        return jsonResponse({ error: "sign_in_required" }, 401);
      }
      if (error instanceof JmapAttachmentTooLargeError) {
        return jsonResponse({ error: "attachment_too_large" }, 413);
      }
      if (error instanceof JmapSendRejectedError) {
        return jsonResponse({ error: error.reason }, 422);
      }
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }
  };
}
