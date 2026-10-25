import {
  JmapAccountMismatchError,
  JmapEmailNotFoundError,
  JmapSendRejectedError,
  type JmapMailDraft,
} from "./client.mts";
import {
  InvalidMailDraftRequest,
  OversizedMailDraftRequest,
  parseMailDraftRequest,
} from "./mail-draft-request.mts";
import { InvalidMailAttachmentReceipt } from "./mail-attachment-receipt.mts";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

type GetDraftOptions = Omit<Parameters<
  typeof import("./client.mts").runJmapOAuthGetDraft
>[0], "attachmentReceiptSecret">;
type SaveDraftOptions = Omit<Parameters<
  typeof import("./client.mts").runJmapOAuthSaveDraft
>[0], "attachmentReceiptSecret">;

export interface MailDraftSession {
  accessToken: string;
  accountId: string;
}

export interface MailDraftRouteDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(sessionId: string): Promise<MailDraftSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  getDraft(options: GetDraftOptions): Promise<JmapMailDraft>;
  saveDraft(options: SaveDraftOptions): Promise<{
    emailId: string;
    previousRemoved: boolean;
  }>;
  getJmapSettings(): Pick<
    GetDraftOptions,
    "sessionUrl" | "trustedOrigins" | "allowInsecureHttp"
  >;
  isTrustedOrigin(request: Request): boolean;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

function contentTypeIsJson(request: Request): boolean {
  return request.headers.get("content-type")?.split(";", 1)[0]
    .trim()
    .toLowerCase() === "application/json";
}

async function authenticateRequest(
  request: Request,
  dependencies: MailDraftRouteDependencies,
): Promise<{
  sessionId: string;
  session: MailDraftSession;
} | Response> {
  try {
    const sessionId = await dependencies.getSessionId(request);
    if (!sessionId) return jsonResponse({ error: "sign_in_required" }, 401);
    const session = await dependencies.getAuthenticatedSession(sessionId);
    if (!session) return jsonResponse({ error: "sign_in_required" }, 401);
    return { sessionId, session };
  } catch {
    return jsonResponse({ error: "mail_unavailable" }, 503);
  }
}

async function failureResponse(
  error: unknown,
  sessionId: string,
  dependencies: MailDraftRouteDependencies,
): Promise<Response> {
  if (error instanceof InvalidMailAttachmentReceipt) {
    return jsonResponse({ error: "invalid_request" }, 400);
  }
  if (error instanceof JmapAccountMismatchError) {
    try {
      await dependencies.revokeSession(sessionId);
    } catch {
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }
    return jsonResponse({ error: "sign_in_required" }, 401);
  }
  if (error instanceof JmapEmailNotFoundError) {
    return jsonResponse({ error: "draft_not_found" }, 404);
  }
  if (error instanceof JmapSendRejectedError) {
    return jsonResponse({ error: error.reason }, 422);
  }
  return jsonResponse({ error: "mail_unavailable" }, 503);
}

function readDraftId(request: Request): string {
  const values = new URL(request.url).searchParams.getAll("draftId");
  const draftId = values[0];
  if (
    values.length !== 1 ||
    !draftId ||
    draftId.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(draftId)
  ) {
    throw new Error("invalid_draft_id");
  }
  return draftId;
}

export function createMailDraftHandlers(
  dependencies: MailDraftRouteDependencies,
) {
  async function GET(request: Request): Promise<Response> {
    let draftId: string;
    try {
      draftId = readDraftId(request);
    } catch {
      return jsonResponse({ error: "invalid_request" }, 400);
    }
    const authenticated = await authenticateRequest(request, dependencies);
    if (authenticated instanceof Response) return authenticated;
    const { sessionId, session } = authenticated;
    try {
      const draft = await dependencies.getDraft({
        accessToken: session.accessToken,
        expectedAccountId: session.accountId,
        draftId,
        ...dependencies.getJmapSettings(),
      });
      return jsonResponse(draft, 200);
    } catch (error) {
      return failureResponse(error, sessionId, dependencies);
    }
  }

  async function POST(request: Request): Promise<Response> {
    if (!dependencies.isTrustedOrigin(request)) {
      return jsonResponse({ error: "origin_not_allowed" }, 403);
    }
    if (!contentTypeIsJson(request)) {
      return jsonResponse({ error: "invalid_request" }, 400);
    }
    let input;
    try {
      input = await parseMailDraftRequest(request);
    } catch (error) {
      if (error instanceof OversizedMailDraftRequest) {
        return jsonResponse({ error: "message_too_large" }, 413);
      }
      if (error instanceof InvalidMailDraftRequest) {
        return jsonResponse({ error: "invalid_request" }, 400);
      }
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }

    const authenticated = await authenticateRequest(request, dependencies);
    if (authenticated instanceof Response) return authenticated;
    const { sessionId, session } = authenticated;
    try {
      const saved = await dependencies.saveDraft({
        accessToken: session.accessToken,
        expectedAccountId: session.accountId,
        input: input.input,
        ...(input.draftId ? { draftId: input.draftId } : {}),
        ...dependencies.getJmapSettings(),
      });
      return jsonResponse({
        draftId: saved.emailId,
        previousRemoved: saved.previousRemoved,
      }, 200);
    } catch (error) {
      return failureResponse(error, sessionId, dependencies);
    }
  }

  return { GET, POST };
}
