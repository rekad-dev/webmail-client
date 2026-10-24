import {
  JmapAccountMismatchError,
  JmapEmailNotFoundError,
  JmapThreadSubjectAmbiguousError,
  type JmapThreadSubjects,
} from "./client.mts";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

type ThreadSubjectOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthThreadSubjects
>[0];

export interface MailThreadSubjectsSession {
  accessToken: string;
  accountId: string;
}

export interface MailThreadSubjectsRouteDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(sessionId: string): Promise<MailThreadSubjectsSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  getThreadSubjects(options: ThreadSubjectOptions): Promise<JmapThreadSubjects>;
  getJmapSettings(): Pick<
    ThreadSubjectOptions,
    "sessionUrl" | "trustedOrigins" | "allowInsecureHttp"
  >;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

function readSubject(request: Request): string {
  const values = new URL(request.url).searchParams.getAll("subject");
  const subject = values[0];
  if (
    values.length !== 1 ||
    !subject ||
    subject.length > 512 ||
    /[\u0000-\u001f\u007f]/.test(subject)
  ) {
    throw new Error("invalid_subject");
  }
  return subject;
}

export function createMailThreadSubjectsGetHandler(
  dependencies: MailThreadSubjectsRouteDependencies,
) {
  return async function GET(request: Request): Promise<Response> {
    let subject: string;
    try {
      subject = readSubject(request);
    } catch {
      return jsonResponse({ error: "invalid_request" }, 400);
    }

    let sessionId: string | null = null;
    try {
      sessionId = await dependencies.getSessionId(request);
      if (!sessionId) return jsonResponse({ error: "sign_in_required" }, 401);
      const session = await dependencies.getAuthenticatedSession(sessionId);
      if (!session) return jsonResponse({ error: "sign_in_required" }, 401);

      const result = await dependencies.getThreadSubjects({
        accessToken: session.accessToken,
        expectedAccountId: session.accountId,
        subject,
        ...dependencies.getJmapSettings(),
      });
      return jsonResponse(result, 200);
    } catch (error) {
      if (error instanceof JmapAccountMismatchError && sessionId) {
        try {
          await dependencies.revokeSession(sessionId);
        } catch {
          return jsonResponse({ error: "mail_unavailable" }, 503);
        }
        return jsonResponse({ error: "sign_in_required" }, 401);
      }
      if (error instanceof JmapEmailNotFoundError) {
        return jsonResponse({ error: "thread_not_found" }, 404);
      }
      if (error instanceof JmapThreadSubjectAmbiguousError) {
        return jsonResponse({ error: "subject_ambiguous" }, 409);
      }
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }
  };
}
