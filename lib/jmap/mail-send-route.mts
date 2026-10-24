import {
  JmapAccountMismatchError,
  JmapDraftMismatchError,
  JmapSendRejectedError,
  type JmapMailSendInput,
  type JmapSendRejectionReason,
} from "./client.mts";
import {
  InvalidMailSendRequest,
  OversizedMailSendRequest,
  parseMailSendRequest,
} from "./mail-send-request.mts";
import type { MailSendRequest } from "./mail-send-request.mts";
import type {
  MailSendAttempt,
  MailSendAttemptState,
} from "../mail/send-attempt-store.mts";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};
const SUBMISSION_RECONCILE_DELAY_MS = 60_000;

type JmapSettings = Pick<
  Parameters<typeof import("./client.mts").runJmapOAuthCreateDraft>[0],
  "sessionUrl" | "trustedOrigins" | "allowInsecureHttp"
>;
type CreateDraftOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthCreateDraft
>[0];
type SubmitOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthSubmitEmail
>[0];
type UpdateSentOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthUpdateSent
>[0];
type ReconcileOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthReconcileSend
>[0];
type DestroyDraftOptions = Parameters<
  typeof import("./client.mts").runJmapOAuthDestroyDraft
>[0];
type ReserveAttemptOptions = Parameters<
  typeof import("../mail/send-attempt-store.mts").reserveMailSendAttempt
>[0];
type TransitionAttemptOptions = Parameters<
  typeof import("../mail/send-attempt-store.mts").transitionMailSendAttempt
>[0];
type GetAttemptOptions = Parameters<
  typeof import("../mail/send-attempt-store.mts").getMailSendAttempt
>[0];

export interface MailSendSession {
  accessToken: string;
  accountId: string;
}

export interface MailSendRouteDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(sessionId: string): Promise<MailSendSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  isTrustedOrigin(request: Request): boolean;
  getJmapSettings(): JmapSettings;
  reserveAttempt(options: ReserveAttemptOptions): Promise<{
    created: boolean;
    attempt: MailSendAttempt;
  }>;
  getAttempt(options: GetAttemptOptions): Promise<MailSendAttempt | null>;
  transitionAttempt(options: TransitionAttemptOptions): Promise<MailSendAttempt | null>;
  createDraft(options: CreateDraftOptions): Promise<{ emailId: string }>;
  submitEmail(options: SubmitOptions): Promise<{
    submissionId: string;
    sentUpdateApplied: boolean;
  }>;
  updateSent(options: UpdateSentOptions): Promise<boolean>;
  reconcile(options: ReconcileOptions): Promise<{
    submissionId: string | null;
    inSentMailbox: boolean;
  }>;
  destroyDraft(options: DestroyDraftOptions): Promise<void>;
}

interface AuthenticatedRequest {
  sessionId: string;
  session: MailSendSession;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

function resultResponse(
  state: "submitted" | "submitted_sent_update_pending",
): Response {
  return jsonResponse({ state }, 200);
}

function inProgressResponse(): Response {
  return jsonResponse({ state: "in_progress" }, 202);
}

function unknownResponse(): Response {
  return jsonResponse({ state: "unknown" }, 202);
}

function rejectedResponse(reason: JmapSendRejectionReason | "send_rejected") {
  return jsonResponse({ state: "rejected", error: reason }, 422);
}

async function authenticateRequest(
  request: Request,
  dependencies: MailSendRouteDependencies,
): Promise<AuthenticatedRequest | Response> {
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

async function handleFailure(
  error: unknown,
  sessionId: string,
  dependencies: MailSendRouteDependencies,
): Promise<Response> {
  if (error instanceof JmapAccountMismatchError) {
    try {
      await dependencies.revokeSession(sessionId);
    } catch {
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }
    return jsonResponse({ error: "sign_in_required" }, 401);
  }
  return jsonResponse({ error: "mail_unavailable" }, 503);
}

function stateAfterTransition(
  attempt: MailSendAttempt | null,
  fallback: MailSendAttemptState,
): MailSendAttemptState {
  return attempt?.state ?? fallback;
}

function attemptKeys(
  sessionId: string,
  accountId: string,
  attemptKey: string,
) {
  return { sessionId, accountId, attemptKey };
}

async function writeState(
  dependencies: MailSendRouteDependencies,
  key: ReturnType<typeof attemptKeys>,
  from: MailSendAttemptState,
  to: MailSendAttemptState,
  values: { emailId?: string; submissionId?: string } = {},
): Promise<MailSendAttempt | null> {
  return dependencies.transitionAttempt({ ...key, from, to, ...values });
}

function isInProgress(attempt: MailSendAttempt): boolean {
  return (
    ["reserved", "draft_created", "submitting"].includes(attempt.state) &&
    Date.now() - attempt.updatedAt.getTime() < SUBMISSION_RECONCILE_DELAY_MS
  );
}

async function reconcileAttempt({
  attempt,
  sessionId,
  session,
  attemptKey,
  dependencies,
}: {
  attempt: MailSendAttempt;
  sessionId: string;
  session: MailSendSession;
  attemptKey: string;
  dependencies: MailSendRouteDependencies;
}): Promise<Response> {
  if (!attempt.emailId) return unknownResponse();
  const key = attemptKeys(sessionId, session.accountId, attemptKey);
  try {
    const evidence = await dependencies.reconcile({
      accessToken: session.accessToken,
      expectedAccountId: session.accountId,
      emailId: attempt.emailId,
      ...dependencies.getJmapSettings(),
    });
    if (!evidence.submissionId && !evidence.inSentMailbox) {
      return unknownResponse();
    }

    let sent = evidence.inSentMailbox;
    if (!sent) {
      try {
        sent = await dependencies.updateSent({
          accessToken: session.accessToken,
          expectedAccountId: session.accountId,
          emailId: attempt.emailId,
          ...dependencies.getJmapSettings(),
        });
      } catch (error) {
        if (error instanceof JmapAccountMismatchError) {
          return handleFailure(error, sessionId, dependencies);
        }
        sent = false;
      }
    }
    const nextState = sent ? "submitted" : "submitted_sent_update_pending";
    const stored = await writeState(
      dependencies,
      key,
      attempt.state,
      nextState,
      evidence.submissionId ? { submissionId: evidence.submissionId } : {},
    );
    return resultResponse(stateAfterTransition(stored, nextState) === "submitted"
      ? "submitted"
      : "submitted_sent_update_pending");
  } catch (error) {
    return handleFailure(error, sessionId, dependencies);
  }
}

async function handleExistingAttempt({
  attempt,
  sessionId,
  session,
  attemptKey,
  dependencies,
}: {
  attempt: MailSendAttempt;
  sessionId: string;
  session: MailSendSession;
  attemptKey: string;
  dependencies: MailSendRouteDependencies;
}): Promise<Response> {
  if (attempt.state === "submitted") return resultResponse("submitted");
  if (attempt.state === "rejected") return rejectedResponse("send_rejected");
  if (isInProgress(attempt)) return inProgressResponse();

  const key = attemptKeys(sessionId, session.accountId, attemptKey);
  if (attempt.state === "submitted_sent_update_pending") {
    if (!attempt.emailId) return resultResponse("submitted_sent_update_pending");
    try {
      const updated = await dependencies.updateSent({
        accessToken: session.accessToken,
        expectedAccountId: session.accountId,
        emailId: attempt.emailId,
        ...dependencies.getJmapSettings(),
      });
      if (!updated) return resultResponse("submitted_sent_update_pending");
      const stored = await writeState(
        dependencies,
        key,
        "submitted_sent_update_pending",
        "submitted",
      );
      return resultResponse(stateAfterTransition(stored, "submitted") === "submitted"
        ? "submitted"
        : "submitted_sent_update_pending");
    } catch (error) {
      return handleFailure(error, sessionId, dependencies);
    }
  }

  if (attempt.state === "submitting") {
    const unknown = await writeState(
      dependencies,
      key,
      "submitting",
      "unknown",
      attempt.emailId ? { emailId: attempt.emailId } : {},
    );
    if (!unknown) {
      const latest = await dependencies.getAttempt(key);
      if (!latest) return unknownResponse();
      return handleExistingAttempt({
        attempt: latest,
        sessionId,
        session,
        attemptKey,
        dependencies,
      });
    }
    return reconcileAttempt({
      attempt: unknown,
      sessionId,
      session,
      attemptKey,
      dependencies,
    });
  }

  if (attempt.state === "reserved" || attempt.state === "draft_created") {
    const rejected = await writeState(
      dependencies,
      key,
      attempt.state,
      "rejected",
      attempt.emailId ? { emailId: attempt.emailId } : {},
    );
    if (!rejected) {
      const latest = await dependencies.getAttempt(key);
      if (!latest) return unknownResponse();
      return handleExistingAttempt({
        attempt: latest,
        sessionId,
        session,
        attemptKey,
        dependencies,
      });
    }
    return rejectedResponse("send_rejected");
  }

  return reconcileAttempt({
    attempt,
    sessionId,
    session,
    attemptKey,
    dependencies,
  });
}

async function markAttemptSafely(
  dependencies: MailSendRouteDependencies,
  key: ReturnType<typeof attemptKeys>,
  from: MailSendAttemptState,
  to: MailSendAttemptState,
  values: { emailId?: string; submissionId?: string } = {},
): Promise<void> {
  try {
    await writeState(dependencies, key, from, to, values);
  } catch {
    // The in-memory result remains authoritative for this response. A repeated
    // request reconciles the durable state before any possible submission.
  }
}

async function runNewAttempt({
  input,
  sessionId,
  session,
  dependencies,
}: {
  input: MailSendRequest;
  sessionId: string;
  session: MailSendSession;
  dependencies: MailSendRouteDependencies;
}): Promise<Response> {
  const key = attemptKeys(sessionId, session.accountId, input.attemptKey);
  const jmapSettings = dependencies.getJmapSettings();

  try {
    const result = await dependencies.createDraft({
      accessToken: session.accessToken,
      expectedAccountId: session.accountId,
      input: sendInput(input),
      ...(input.draftId ? { existingDraftId: input.draftId } : {}),
      ...jmapSettings,
    });
    const draft = await writeState(
      dependencies,
      key,
      "reserved",
      "draft_created",
      { emailId: result.emailId },
    );
    if (!draft) return inProgressResponse();

    const submitting = await writeState(
      dependencies,
      key,
      "draft_created",
      "submitting",
    );
    if (!submitting) return inProgressResponse();

    let submitted: { submissionId: string; sentUpdateApplied: boolean };
    try {
      submitted = await dependencies.submitEmail({
        accessToken: session.accessToken,
        expectedAccountId: session.accountId,
        identityId: input.identityId,
        emailId: result.emailId,
        attemptKey: input.attemptKey,
        ...jmapSettings,
      });
    } catch (error) {
      if (error instanceof JmapDraftMismatchError) {
        await markAttemptSafely(
          dependencies,
          key,
          "submitting",
          "rejected",
        );
        if (!input.draftId) {
          try {
            await dependencies.destroyDraft({
              accessToken: session.accessToken,
              expectedAccountId: session.accountId,
              emailId: result.emailId,
              ...jmapSettings,
            });
          } catch {
            // A temporary draft may remain, but it is never resubmitted here.
          }
        }
        return rejectedResponse("draft_changed");
      }
      if (error instanceof JmapSendRejectedError) {
        await markAttemptSafely(dependencies, key, "submitting", "rejected");
        if (!input.draftId) {
          try {
            await dependencies.destroyDraft({
              accessToken: session.accessToken,
              expectedAccountId: session.accountId,
              emailId: result.emailId,
              ...jmapSettings,
            });
          } catch {
            // A temporary draft may remain, but it is never resubmitted here.
          }
        }
        return rejectedResponse(error.reason);
      }
      if (error instanceof JmapAccountMismatchError) {
        await markAttemptSafely(
          dependencies,
          key,
          "submitting",
          "rejected",
        );
      } else {
        await markAttemptSafely(
          dependencies,
          key,
          "submitting",
          "unknown",
        );
        return unknownResponse();
      }
      return handleFailure(error, sessionId, dependencies);
    }

    const state = submitted.sentUpdateApplied
      ? "submitted"
      : "submitted_sent_update_pending";
    await markAttemptSafely(dependencies, key, "submitting", state, {
      emailId: result.emailId,
      submissionId: submitted.submissionId,
    });
    return resultResponse(state);
  } catch (error) {
    if (error instanceof JmapDraftMismatchError) {
      await markAttemptSafely(dependencies, key, "reserved", "rejected");
      return rejectedResponse("draft_changed");
    }
    if (error instanceof JmapSendRejectedError) {
      await markAttemptSafely(dependencies, key, "reserved", "rejected");
      return rejectedResponse(error.reason);
    }
    if (error instanceof JmapAccountMismatchError) {
      await markAttemptSafely(dependencies, key, "reserved", "rejected");
      return handleFailure(error, sessionId, dependencies);
    }
    await markAttemptSafely(dependencies, key, "reserved", "unknown");
    return unknownResponse();
  }
}

function sendInput(input: MailSendRequest): JmapMailSendInput {
  const { attemptKey: _attemptKey, draftId: _draftId, ...sendInputValue } = input;
  return sendInputValue;
}

export function createMailSendPostHandler(
  dependencies: MailSendRouteDependencies,
) {
  return async function POST(request: Request): Promise<Response> {
    if (!dependencies.isTrustedOrigin(request)) {
      return jsonResponse({ error: "origin_not_allowed" }, 403);
    }
    const contentType = request.headers.get("content-type")?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (contentType !== "application/json") {
      return jsonResponse({ error: "invalid_request" }, 400);
    }

    let input: MailSendRequest;
    try {
      input = await parseMailSendRequest(request);
    } catch (error) {
      if (error instanceof OversizedMailSendRequest) {
        return jsonResponse({ error: "message_too_large" }, 413);
      }
      if (error instanceof InvalidMailSendRequest) {
        return jsonResponse({ error: "invalid_request" }, 400);
      }
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }

    const authenticated = await authenticateRequest(request, dependencies);
    if (authenticated instanceof Response) return authenticated;
    const { sessionId, session } = authenticated;
    const key = attemptKeys(sessionId, session.accountId, input.attemptKey);

    let reservation: { created: boolean; attempt: MailSendAttempt };
    try {
      reservation = await dependencies.reserveAttempt(key);
    } catch {
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }

    if (!reservation.created) {
      return handleExistingAttempt({
        attempt: reservation.attempt,
        sessionId,
        session,
        attemptKey: input.attemptKey,
        dependencies,
      });
    }

    return runNewAttempt({ input, sessionId, session, dependencies });
  };
}
