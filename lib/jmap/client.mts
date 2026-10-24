import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { sanitizeEmailHtml } from "../mail/sanitize-email-html.mts";

const CORE_CAPABILITY = "urn:ietf:params:jmap:core";
const MAIL_CAPABILITY = "urn:ietf:params:jmap:mail";
const SUBMISSION_CAPABILITY = "urn:ietf:params:jmap:submission";
const METHOD_CALL_ID = "phase0-mailboxes";
const EMAIL_QUERY_CALL_ID = "phase2-email-query";
const EMAIL_GET_CALL_ID = "phase2-email-get";
const EMAIL_DETAIL_GET_CALL_ID = "phase3-email-detail-get";
const EMAIL_MARK_READ_CALL_ID = "phase3-email-mark-read";
const IDENTITY_GET_CALL_ID = "phase4-identity-get";
const EMAIL_CREATE_DRAFT_CALL_ID = "phase4-email-create-draft";
const EMAIL_SUBMISSION_SET_CALL_ID = "phase4-email-submission-set";
const EMAIL_UPDATE_SENT_CALL_ID = "phase4-email-update-sent";
const EMAIL_SUBMISSION_QUERY_CALL_ID = "phase4-email-submission-query";
const EMAIL_RECONCILE_GET_CALL_ID = "phase4-email-reconcile-get";
const EMAIL_DESTROY_DRAFT_CALL_ID = "phase4-email-destroy-draft";
const EMAIL_THREAD_GET_CALL_ID = "phase5-thread-get";
const EMAIL_THREAD_EMAIL_GET_CALL_ID = "phase5-thread-email-get";
const EMAIL_THREAD_LIST_GET_CALL_ID = "phase5-thread-list-get";
const EMAIL_THREAD_STATE_GET_CALL_ID = "phase5-thread-state-get";
const EMAIL_ACTION_GET_CALL_ID = "phase5-action-email-get";
const EMAIL_ACTION_SET_CALL_ID = "phase5-action-email-set";
const EMAIL_DRAFT_GET_CALL_ID = "phase5-draft-get";
const EMAIL_DRAFT_CREATE_CALL_ID = "phase5-draft-create";
const EMAIL_DRAFT_DESTROY_CALL_ID = "phase5-draft-destroy";
const EMAIL_SEND_MARKER_GET_CALL_ID = "phase5-send-marker-get";
const EMAIL_SEND_MARKER_SET_CALL_ID = "phase5-send-marker-set";
const MAX_SESSION_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 15_000;
const JMAP_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
const EMAIL_DETAIL_RESPONSE_MAX_BYTES = 1024 * 1024;
const EMAIL_BODY_VALUE_MAX_BYTES = 256 * 1024;
const EMAIL_BODY_VALUE_MAX_CHARS = 256 * 1024;
const MAX_THREAD_EMAILS = 100;
const MAX_THREAD_STATE_EMAILS_PER_THREAD = 1_000;
const THREAD_STATE_EMAIL_GET_BATCH_SIZE = 100;
const DRAFT_SEND_PENDING_PREFIX = "rekad-send-pending-";
export const MAIL_PAGE_SIZE = 25;
export const MAX_MAIL_POSITION = 1_000_000;

const MAILBOX_PROPERTIES = [
  "id",
  "name",
  "role",
  "totalEmails",
  "unreadEmails",
] as const;
const EMAIL_SUMMARY_PROPERTIES = [
  "id",
  "threadId",
  "from",
  "subject",
  "receivedAt",
  "keywords",
  "preview",
] as const;

interface JmapAccount {
  accountCapabilities?: Record<string, unknown>;
}

interface JmapSession {
  capabilities?: Record<string, unknown>;
  accounts?: Record<string, JmapAccount>;
  primaryAccounts?: Record<string, string>;
  apiUrl?: string;
  uploadUrl?: string;
  downloadUrl?: string;
  eventSourceUrl?: string | null;
}

interface EndpointUrls {
  apiUrl: URL;
  uploadUrl: URL;
  downloadUrl: URL;
  eventSourceUrl?: URL;
}

interface RunJmapPocOptions {
  sessionUrl: string;
  trustedOrigins?: string[];
  allowInsecureHttp?: boolean;
  username?: string;
  password?: string;
  discoveryOnly?: boolean;
  fetchImpl?: typeof fetch;
}

type JmapPocResult =
  | {
      authenticated: false;
      endpointOrigins: Record<string, string>;
      capabilities: string[];
    }
  | {
      authenticated: true;
      mailboxCount: number;
      roles: string[];
    };

export interface JmapMailboxSummary {
  id: string;
  name: string;
  role: string | null;
  totalEmails: number;
  unreadEmails: number;
}

export interface JmapEmailSummary {
  id: string;
  threadId: string;
  from: Array<{ name: string | null; email: string }>;
  subject: string | null;
  receivedAt: string | null;
  preview: string;
  isUnread: boolean;
  isStarred: boolean;
  isDraft: boolean;
}

export interface JmapMailboxListing {
  mailboxes: JmapMailboxSummary[];
  selectedMailboxId: string;
  position: number;
  pageSize: number;
  total: number | null;
  hasMore: boolean;
  messages: JmapEmailSummary[];
}

export interface JmapEmailAddress {
  name: string | null;
  email: string;
}

export interface JmapComposeIdentity {
  id: string;
  name: string;
  email: string;
  isWildcard: boolean;
  replyTo: JmapEmailAddress[];
  bcc: JmapEmailAddress[];
  textSignature: string;
}

export interface JmapComposePreflight {
  submissionAvailable: boolean;
  draftsMailboxId: string | null;
  sentMailboxId: string | null;
  identities: JmapComposeIdentity[];
}

export interface JmapMailSendInput {
  identityId: string;
  fromEmail?: string;
  to: JmapEmailAddress[];
  cc: JmapEmailAddress[];
  bcc: JmapEmailAddress[];
  subject: string;
  body: string;
  inReplyTo?: string[];
  references?: string[];
}

export interface JmapMailDraftInput extends JmapMailSendInput {}

export type JmapMailAction =
  | "mark_read"
  | "mark_unread"
  | "star"
  | "unstar"
  | "move"
  | "archive"
  | "trash";

export interface JmapMailActionInput {
  action: JmapMailAction;
  emailId?: string;
  threadId?: string;
  sourceMailboxId?: string;
  destinationMailboxId?: string;
}

export interface JmapThreadMessageSummary {
  id: string;
  threadId: string;
  from: JmapEmailAddress[];
  subject: string | null;
  receivedAt: string | null;
  preview: string;
  isUnread: boolean;
  isStarred: boolean;
  isDraft: boolean;
}

export interface JmapThreadView {
  threadId: string;
  messages: JmapThreadMessageSummary[];
  truncated: boolean;
}

export interface JmapMailDraft {
  id: string;
  from: JmapEmailAddress[];
  to: JmapEmailAddress[];
  cc: JmapEmailAddress[];
  bcc: JmapEmailAddress[];
  subject: string;
  body: string;
  inReplyTo: string[];
  references: string[];
}

export interface JmapEmailAttachmentSummary {
  name: string | null;
  type: string | null;
  size: number | null;
}

export interface JmapEmailDetail {
  id: string;
  threadId: string;
  from: JmapEmailAddress[];
  replyTo: JmapEmailAddress[];
  to: JmapEmailAddress[];
  cc: JmapEmailAddress[];
  bcc: JmapEmailAddress[];
  subject: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  isUnread: boolean;
  isStarred: boolean;
  isDraft: boolean;
  messageId: string[];
  inReplyTo: string[];
  references: string[];
  textBody: string | null;
  htmlBody: string | null;
  externalLinks: string[];
  bodyTruncated: boolean;
  attachments: JmapEmailAttachmentSummary[];
  mailboxIds: string[];
}

export interface JmapInboxSmokeResult {
  mailboxCount: number;
  roles: string[];
  inboxMessageCount: number;
  inboxTotal: number | null;
  fetchedSummaryCount: number;
}

export class JmapPocError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JmapPocError";
  }
}

export class JmapAccountMismatchError extends JmapPocError {
  constructor() {
    super("The JMAP account does not match the authenticated app session.");
    this.name = "JmapAccountMismatchError";
  }
}

export class JmapMailboxNotFoundError extends JmapPocError {
  constructor() {
    super("The selected mailbox is unavailable.");
    this.name = "JmapMailboxNotFoundError";
  }
}

export class JmapEmailNotFoundError extends JmapPocError {
  constructor() {
    super("The selected email is unavailable.");
    this.name = "JmapEmailNotFoundError";
  }
}

export class JmapMailActionUnavailableError extends JmapPocError {
  readonly reason: "archive_unavailable" | "trash_unavailable" | "thread_too_large";

  constructor(reason: JmapMailActionUnavailableError["reason"]) {
    super("The requested mailbox action is unavailable.");
    this.name = "JmapMailActionUnavailableError";
    this.reason = reason;
  }
}

export class JmapDraftMismatchError extends JmapPocError {
  constructor() {
    super("The saved draft no longer matches the message being submitted.");
    this.name = "JmapDraftMismatchError";
  }
}

class JmapStateMismatchError extends JmapPocError {
  constructor() {
    super("The JMAP object changed before the update could be applied.");
    this.name = "JmapStateMismatchError";
  }
}

export type JmapSendRejectionReason =
  | "submission_unavailable"
  | "identity_invalid"
  | "recipient_invalid"
  | "no_recipients"
  | "too_many_recipients"
  | "message_too_large"
  | "sender_forbidden"
  | "send_forbidden"
  | "server_rejected"
  | "draft_changed";

export class JmapSendRejectedError extends JmapPocError {
  readonly reason: JmapSendRejectionReason;

  constructor(reason: JmapSendRejectionReason) {
    super("Stalwart rejected the email submission.");
    this.name = "JmapSendRejectedError";
    this.reason = reason;
  }
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const version = isIP(host);

  if (version === 4) {
    const [first, second] = host.split(".").map(Number);
    return (
      first === 10 ||
      first === 127 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254)
    );
  }

  if (version === 6) {
    return (
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      /^fe[89ab]/i.test(host)
    );
  }

  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    host.endsWith(".lan") ||
    !host.includes(".")
  );
}

function assertAllowedProtocol(url: URL, allowInsecureHttp: boolean): void {
  if (url.protocol === "https:") return;

  if (
    url.protocol === "http:" &&
    allowInsecureHttp &&
    isPrivateHost(url.hostname)
  ) {
    return;
  }

  throw new JmapPocError(
    "JMAP URLs must use HTTPS. Private HTTP requires the explicit private-network setting.",
  );
}

function parseUrl(
  value: string | URL,
  baseUrl: string | URL | undefined,
  allowInsecureHttp: boolean,
): URL {
  let url;
  try {
    url = new URL(value, baseUrl);
  } catch {
    throw new JmapPocError("The JMAP server returned an invalid endpoint URL.");
  }

  if (url.username || url.password || url.hash) {
    throw new JmapPocError(
      "JMAP endpoint URLs cannot contain credentials or fragments.",
    );
  }

  assertAllowedProtocol(url, allowInsecureHttp);
  return url;
}

function parseTrustedOrigins(
  values: string[],
  sessionUrl: URL,
  allowInsecureHttp: boolean,
): Set<string> {
  const origins = new Set([sessionUrl.origin]);

  for (const value of values) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new JmapPocError(
        "STALWART_JMAP_TRUSTED_ORIGINS must contain valid origins.",
      );
    }

    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new JmapPocError(
        "Each trusted JMAP value must be an origin, without a path or credentials.",
      );
    }

    assertAllowedProtocol(url, allowInsecureHttp);
    origins.add(url.origin);
  }

  return origins;
}

function resolveTrustedUrl(
  value: string,
  baseUrl: URL,
  trustedOrigins: Set<string>,
  allowInsecureHttp: boolean,
): URL {
  const url = parseUrl(value, baseUrl, allowInsecureHttp);
  if (!trustedOrigins.has(url.origin)) {
    throw new JmapPocError(
      "A JMAP endpoint uses an origin outside STALWART_JMAP_TRUSTED_ORIGINS.",
    );
  }
  return url;
}

function makeAuthorization(
  username: string,
  password: string,
): string | undefined {
  if (!username && !password) return undefined;
  if (!username || !password) {
    throw new JmapPocError(
      "Set both JMAP_TEST_USERNAME and JMAP_TEST_PASSWORD, or leave both empty.",
    );
  }
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

async function fetchSession({
  sessionUrl,
  trustedOrigins,
  allowInsecureHttp,
  authorization,
  fetchImpl,
}: {
  sessionUrl: URL;
  trustedOrigins: Set<string>;
  allowInsecureHttp: boolean;
  authorization: string | undefined;
  fetchImpl: typeof fetch;
}): Promise<{ session: JmapSession; sessionUrl: URL }> {
  let currentUrl = sessionUrl;

  for (let redirects = 0; redirects <= MAX_SESSION_REDIRECTS; redirects += 1) {
    let response;
    try {
      response = await fetchImpl(currentUrl, {
        method: "GET",
        headers: authorization
          ? { authorization, accept: "application/json" }
          : { accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new JmapPocError(
        "Could not reach the configured JMAP session endpoint (network or TLS failure).",
      );
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects === MAX_SESSION_REDIRECTS) {
        throw new JmapPocError(
          "JMAP session discovery exceeded the redirect limit.",
        );
      }

      const location = response.headers.get("location");
      if (!location) {
        throw new JmapPocError(
          "JMAP session discovery returned a redirect without a location.",
        );
      }

      currentUrl = resolveTrustedUrl(
        location,
        currentUrl,
        trustedOrigins,
        allowInsecureHttp,
      );
      continue;
    }

    if (!response.ok) {
      throw new JmapPocError(
        `JMAP session discovery returned HTTP ${response.status}.`,
      );
    }

    try {
      return {
        session: (await response.json()) as JmapSession,
        sessionUrl: currentUrl,
      };
    } catch {
      throw new JmapPocError("JMAP session discovery returned invalid JSON.");
    }
  }

  throw new JmapPocError("JMAP session discovery failed.");
}

function validateSession(
  sessionValue: unknown,
  sessionUrl: URL,
  trustedOrigins: Set<string>,
  allowInsecureHttp: boolean,
): EndpointUrls {
  if (
    !sessionValue ||
    typeof sessionValue !== "object" ||
    Array.isArray(sessionValue)
  ) {
    throw new JmapPocError("JMAP session discovery returned an invalid session.");
  }
  const session = sessionValue as JmapSession;

  const capabilities = session.capabilities;
  if (
    !capabilities ||
    typeof capabilities !== "object" ||
    Array.isArray(capabilities)
  ) {
    throw new JmapPocError("The JMAP session did not include capabilities.");
  }

  if (!capabilities[CORE_CAPABILITY] || !capabilities[MAIL_CAPABILITY]) {
    throw new JmapPocError(
      "The server session does not advertise JMAP Core and JMAP Mail capabilities.",
    );
  }

  const endpointNames = ["apiUrl", "uploadUrl", "downloadUrl"] as const;
  for (const name of endpointNames) {
    if (typeof session[name] !== "string" || session[name].length === 0) {
      throw new JmapPocError(`The JMAP session did not advertise ${name}.`);
    }
  }

  const endpointUrls: Partial<EndpointUrls> = {};
  const allEndpointNames = [...endpointNames, "eventSourceUrl"] as const;
  for (const name of allEndpointNames) {
    const value = session[name];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" || value.length === 0) {
      throw new JmapPocError(`The JMAP session advertised an invalid ${name}.`);
    }

    endpointUrls[name] = resolveTrustedUrl(
      value,
      sessionUrl,
      trustedOrigins,
      allowInsecureHttp,
    );
  }

  const { apiUrl, uploadUrl, downloadUrl, eventSourceUrl } = endpointUrls;
  if (!apiUrl || !uploadUrl || !downloadUrl) {
    throw new JmapPocError("The JMAP session omitted a required endpoint URL.");
  }

  return {
    apiUrl,
    uploadUrl,
    downloadUrl,
    ...(eventSourceUrl ? { eventSourceUrl } : {}),
  };
}

function mailboxGetRequest(accountId: string) {
  return {
    using: [CORE_CAPABILITY, MAIL_CAPABILITY],
    methodCalls: [
      [
        "Mailbox/get",
        { accountId, ids: null, properties: MAILBOX_PROPERTIES },
        METHOD_CALL_ID,
      ],
    ],
  };
}

function getPrimaryMailAccountId(sessionValue: unknown): string {
  const session = sessionValue as JmapSession;
  const accountId = session.primaryAccounts?.[MAIL_CAPABILITY];
  const account =
    typeof accountId === "string" ? session.accounts?.[accountId] : undefined;
  if (
    !accountId ||
    !account ||
    !account.accountCapabilities?.[MAIL_CAPABILITY]
  ) {
    throw new JmapPocError(
      "The authenticated JMAP session did not provide a primary mail account.",
    );
  }
  return accountId;
}

function getMethodResponse(
  responseJson: unknown,
  callId: string,
  methodName: string,
): { methodName: string; payload: Record<string, unknown> } {
  const responses = (responseJson as { methodResponses?: unknown } | null)
    ?.methodResponses;
  if (!Array.isArray(responses)) {
    throw new JmapPocError("The JMAP API response did not contain methodResponses.");
  }

  const result = (responses as unknown[]).find((methodResponse) =>
    Array.isArray(methodResponse) && methodResponse[2] === callId,
  );
  if (!result) {
    throw new JmapPocError(`The JMAP API response omitted ${methodName}.`);
  }

  const [responseName, rawPayload] = result as [unknown, unknown, unknown];
  if (
    !rawPayload ||
    typeof rawPayload !== "object" ||
    Array.isArray(rawPayload)
  ) {
    throw new JmapPocError(`The JMAP API returned an invalid ${methodName} response.`);
  }
  const payload = rawPayload as Record<string, unknown>;
  if (responseName === "error") {
    const rawErrorType = payload.type;
    const errorType =
      typeof rawErrorType === "string" &&
      /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(rawErrorType)
        ? rawErrorType
        : "unknown";
    if (errorType === "stateMismatch") throw new JmapStateMismatchError();
    throw new JmapPocError(`JMAP ${methodName} failed (${errorType}).`);
  }

  if (responseName !== methodName) {
    throw new JmapPocError(`The JMAP API returned an invalid ${methodName} response.`);
  }

  return { methodName, payload };
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

function parseMailboxList(responseJson: unknown): JmapMailboxSummary[] {
  const { payload } = getMethodResponse(responseJson, METHOD_CALL_ID, "Mailbox/get");
  if (!Array.isArray(payload.list)) {
    throw new JmapPocError("The JMAP API returned an invalid Mailbox/get response.");
  }

  const mailboxes: JmapMailboxSummary[] = [];
  for (const rawMailbox of payload.list) {
    if (
      !rawMailbox ||
      typeof rawMailbox !== "object" ||
      Array.isArray(rawMailbox)
    ) {
      throw new JmapPocError("The JMAP API returned an invalid mailbox.");
    }
    const mailbox = rawMailbox as Record<string, unknown>;
    if (
      typeof mailbox.id !== "string" ||
      mailbox.id.length === 0 ||
      mailbox.id.length > 256 ||
      typeof mailbox.name !== "string"
    ) {
      throw new JmapPocError("The JMAP API returned an invalid mailbox.");
    }

    mailboxes.push({
      id: mailbox.id,
      name: mailbox.name.slice(0, 256),
      role: typeof mailbox.role === "string" ? mailbox.role.slice(0, 64) : null,
      totalEmails: nonNegativeInteger(mailbox.totalEmails),
      unreadEmails: nonNegativeInteger(mailbox.unreadEmails),
    });
  }

  return mailboxes;
}

function summarizeMailboxes(mailboxes: JmapMailboxSummary[]): {
  mailboxCount: number;
  roles: string[];
} {
  return {
    mailboxCount: mailboxes.length,
    roles: [
      ...new Set(mailboxes.flatMap((mailbox) => mailbox.role ?? [])),
    ].sort(),
  };
}

async function postJmapApi({
  apiUrl,
  authorization,
  requestBody,
  methodName,
  fetchImpl,
  maxResponseBytes = JMAP_RESPONSE_MAX_BYTES,
}: {
  apiUrl: URL;
  authorization: string;
  requestBody: Record<string, unknown>;
  methodName: string;
  fetchImpl: typeof fetch;
  maxResponseBytes?: number;
}): Promise<unknown> {
  let response;
  try {
    response = await fetchImpl(apiUrl, {
      method: "POST",
      headers: {
        authorization,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new JmapPocError(
      "Could not reach the configured JMAP API endpoint (network or TLS failure).",
    );
  }

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    throw new JmapPocError(
      `The advertised JMAP API endpoint redirected during ${methodName}. Update trusted endpoint configuration and rediscover the session.`,
    );
  }
  if (!response.ok) {
    throw new JmapPocError(`JMAP ${methodName} returned HTTP ${response.status}.`);
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isSafeInteger(contentLength) && contentLength > maxResponseBytes) {
    throw new JmapPocError(`JMAP ${methodName} response exceeded the size limit.`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new JmapPocError(`JMAP ${methodName} returned an empty response.`);
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxResponseBytes) {
        void reader.cancel().catch(() => undefined);
        throw new JmapPocError(
          `JMAP ${methodName} response exceeded the size limit.`,
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof JmapPocError) throw error;
    throw new JmapPocError(`Could not read the JMAP ${methodName} response.`);
  } finally {
    reader.releaseLock();
  }

  const responseBytes = new Uint8Array(totalBytes);
  let responseOffset = 0;
  for (const chunk of chunks) {
    responseBytes.set(chunk, responseOffset);
    responseOffset += chunk.byteLength;
  }

  let responseJson: unknown;
  try {
    responseJson = JSON.parse(new TextDecoder().decode(responseBytes)) as unknown;
  } catch {
    throw new JmapPocError(`JMAP ${methodName} returned invalid JSON.`);
  }

  return responseJson;
}

async function fetchMailboxList({
  apiUrl,
  accountId,
  authorization,
  fetchImpl,
}: {
  apiUrl: URL;
  accountId: string;
  authorization: string;
  fetchImpl: typeof fetch;
}): Promise<JmapMailboxSummary[]> {
  const responseJson = await postJmapApi({
    apiUrl,
    authorization,
    requestBody: mailboxGetRequest(accountId),
    methodName: "Mailbox/get",
    fetchImpl,
  });
  return parseMailboxList(responseJson);
}

async function fetchMailboxSummary({
  apiUrl,
  accountId,
  authorization,
  fetchImpl,
}: {
  apiUrl: URL;
  accountId: string;
  authorization: string;
  fetchImpl: typeof fetch;
}): Promise<{ mailboxCount: number; roles: string[] }> {
  const mailboxes = await fetchMailboxList({
    apiUrl,
    accountId,
    authorization,
    fetchImpl,
  });
  return summarizeMailboxes(mailboxes);
}

function emailPageRequest(
  accountId: string,
  mailboxId: string,
  position: number,
  searchText?: string,
  searchScope: "all" | "mailbox" = "all",
  includeSummaryGet = true,
) {
  const filter: Record<string, unknown> = {};
  if (searchText) filter.text = searchText;
  if (!searchText || searchScope === "mailbox") filter.inMailbox = mailboxId;

  const methodCalls: unknown[][] = [
    [
      "Email/query",
      {
        accountId,
        filter,
        sort: [{ property: "receivedAt", isAscending: false }],
        collapseThreads: true,
        position,
        limit: MAIL_PAGE_SIZE,
        calculateTotal: true,
      },
      EMAIL_QUERY_CALL_ID,
    ],
  ];
  if (includeSummaryGet) {
    methodCalls.push([
      "Email/get",
      {
        accountId,
        "#ids": {
          resultOf: EMAIL_QUERY_CALL_ID,
          name: "Email/query",
          path: "/ids",
        },
        properties: EMAIL_SUMMARY_PROPERTIES,
      },
      EMAIL_GET_CALL_ID,
    ]);
  }

  return {
    using: [CORE_CAPABILITY, MAIL_CAPABILITY],
    methodCalls,
  };
}

function emailSummaryGetRequest(accountId: string, emailIds: string[]) {
  return {
    using: [CORE_CAPABILITY, MAIL_CAPABILITY],
    methodCalls: [[
      "Email/get",
      { accountId, ids: emailIds, properties: EMAIL_SUMMARY_PROPERTIES },
      EMAIL_GET_CALL_ID,
    ]],
  };
}

function parseEmailQuery(responseJson: unknown): {
  ids: string[];
  total: number | null;
} {
  const { payload } = getMethodResponse(
    responseJson,
    EMAIL_QUERY_CALL_ID,
    "Email/query",
  );
  if (
    !Array.isArray(payload.ids) ||
    !payload.ids.every(
      (id) => typeof id === "string" && id.length > 0 && id.length <= 256,
    )
  ) {
    throw new JmapPocError("The JMAP API returned an invalid Email/query response.");
  }

  return {
    ids: payload.ids as string[],
    total:
      typeof payload.total === "number" &&
      Number.isSafeInteger(payload.total) &&
      payload.total >= 0
        ? payload.total
        : null,
  };
}

function boundedString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" ? value.slice(0, maxLength) : null;
}

function parseEmailAddresses(value: unknown): JmapEmailSummary["from"] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((rawAddress) => {
    if (!rawAddress || typeof rawAddress !== "object" || Array.isArray(rawAddress)) {
      return [];
    }
    const address = rawAddress as Record<string, unknown>;
    if (typeof address.email !== "string" || address.email.length > 320) {
      return [];
    }
    return [{ name: boundedString(address.name, 128), email: address.email }];
  });
}

function parseReceivedAt(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    return null;
  }
  return new Date(value).toISOString();
}

function parseMessageIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((item) =>
    typeof item === "string" &&
    item.length > 0 &&
    item.length <= 998 &&
    !/[\u0000-\u001f\u007f]/.test(item)
      ? [item]
      : [],
  );
}

function parseEmailSummaries(
  responseJson: unknown,
  queryIds: string[],
): JmapEmailSummary[] {
  const { payload } = getMethodResponse(
    responseJson,
    EMAIL_GET_CALL_ID,
    "Email/get",
  );
  if (!Array.isArray(payload.list)) {
    throw new JmapPocError("The JMAP API returned an invalid Email/get response.");
  }
  if (!Array.isArray(payload.notFound)) {
    throw new JmapPocError("The JMAP API returned an invalid Email/get response.");
  }

  const allowedIds = new Set(queryIds);
  const notFoundIds = new Set<string>();
  for (const rawId of payload.notFound) {
    if (
      typeof rawId !== "string" ||
      !allowedIds.has(rawId) ||
      notFoundIds.has(rawId)
    ) {
      throw new JmapPocError("The JMAP API returned an invalid Email/get response.");
    }
    notFoundIds.add(rawId);
  }
  const summaries = new Map<string, JmapEmailSummary>();
  for (const rawEmail of payload.list) {
    if (!rawEmail || typeof rawEmail !== "object" || Array.isArray(rawEmail)) {
      throw new JmapPocError("The JMAP API returned an invalid email summary.");
    }
    const email = rawEmail as Record<string, unknown>;
    if (
      typeof email.id !== "string" ||
      !allowedIds.has(email.id) ||
      summaries.has(email.id) ||
      notFoundIds.has(email.id)
    ) {
      throw new JmapPocError("The JMAP API returned an invalid email summary.");
    }

    const keywords =
      email.keywords &&
      typeof email.keywords === "object" &&
      !Array.isArray(email.keywords)
        ? (email.keywords as Record<string, unknown>)
        : {};
    summaries.set(email.id, {
      id: email.id,
      threadId:
        typeof email.threadId === "string" &&
        email.threadId.length > 0 &&
        email.threadId.length <= 256
          ? email.threadId
          : email.id,
      from: parseEmailAddresses(email.from),
      subject: boundedString(email.subject, 512),
      receivedAt: parseReceivedAt(email.receivedAt),
      preview: boundedString(email.preview, 256) ?? "",
      isUnread: keywords["$seen"] !== true,
      isStarred: keywords["$flagged"] === true,
      isDraft: keywords["$draft"] === true,
    });
  }

  if (queryIds.some((id) => !summaries.has(id) && !notFoundIds.has(id))) {
    throw new JmapPocError("The JMAP API omitted an email summary.");
  }

  return queryIds.flatMap((id) => {
    const summary = summaries.get(id);
    return summary ? [summary] : [];
  });
}

function parseThreadMemberIds(
  responseJson: unknown,
  expectedThreadIds: string[],
): {
  emailIds: string[];
  threadByEmailId: Map<string, string>;
  missingThreadIds: Set<string>;
} {
  const { payload } = getMethodResponse(
    responseJson,
    EMAIL_THREAD_LIST_GET_CALL_ID,
    "Thread/get",
  );
  if (!Array.isArray(payload.list)) {
    throw new JmapPocError("The JMAP API returned an invalid thread list response.");
  }
  if (!Array.isArray(payload.notFound)) {
    throw new JmapPocError("The JMAP API returned an invalid thread list response.");
  }

  const expected = new Set(expectedThreadIds);
  const seenThreads = new Set<string>();
  const missingThreadIds = new Set<string>();
  for (const rawId of payload.notFound) {
    if (
      typeof rawId !== "string" ||
      !expected.has(rawId) ||
      missingThreadIds.has(rawId)
    ) {
      throw new JmapPocError("The JMAP API returned an invalid thread list.");
    }
    missingThreadIds.add(rawId);
  }
  const threadByEmailId = new Map<string, string>();
  for (const rawThread of payload.list) {
    const thread = objectValue(rawThread);
    if (
      !thread ||
      typeof thread.id !== "string" ||
      !expected.has(thread.id) ||
      seenThreads.has(thread.id) ||
      missingThreadIds.has(thread.id) ||
      !Array.isArray(thread.emailIds) ||
      thread.emailIds.length === 0 ||
      thread.emailIds.length > MAX_THREAD_STATE_EMAILS_PER_THREAD
    ) {
      throw new JmapPocError("The JMAP API returned an invalid thread list.");
    }
    seenThreads.add(thread.id);

    const memberIds = new Set<string>();
    for (const emailId of thread.emailIds) {
      if (
        typeof emailId !== "string" ||
        emailId.length === 0 ||
        emailId.length > 256 ||
        memberIds.has(emailId) ||
        threadByEmailId.has(emailId)
      ) {
        throw new JmapPocError("The JMAP API returned invalid thread members.");
      }
      memberIds.add(emailId);
      threadByEmailId.set(emailId, thread.id);
    }
  }

  if ([...expected].some((threadId) =>
    !seenThreads.has(threadId) && !missingThreadIds.has(threadId),
  )) {
    throw new JmapPocError("The JMAP API omitted a thread result.");
  }
  return {
    emailIds: [...threadByEmailId.keys()],
    threadByEmailId,
    missingThreadIds,
  };
}

function maxObjectsInGet(context: JmapApiContext): number {
  const core = objectValue(context.capabilities[CORE_CAPABILITY]);
  const advertised = core?.maxObjectsInGet;
  if (typeof advertised !== "number" || !Number.isSafeInteger(advertised) || advertised < 1) {
    return THREAD_STATE_EMAIL_GET_BATCH_SIZE;
  }
  return Math.min(advertised, THREAD_STATE_EMAIL_GET_BATCH_SIZE);
}

async function aggregateThreadSummaryState(
  context: JmapApiContext,
  messages: JmapEmailSummary[],
): Promise<JmapEmailSummary[]> {
  if (messages.length === 0) return messages;

  const threadIds = [...new Set(messages.map((message) => message.threadId))];
  const threadByEmailId = new Map<string, string>();
  const emailIds: string[] = [];
  const staleThreadIds = new Set<string>();
  const threadBatchSize = maxObjectsInGet(context);
  for (let start = 0; start < threadIds.length; start += threadBatchSize) {
    const requestedThreadIds = threadIds.slice(start, start + threadBatchSize);
    const threadResponse = await postJmapApi({
      apiUrl: context.apiUrl,
      authorization: context.authorization,
      requestBody: {
        using: [CORE_CAPABILITY, MAIL_CAPABILITY],
        methodCalls: [[
          "Thread/get",
          {
            accountId: context.accountId,
            ids: requestedThreadIds,
            properties: ["id", "emailIds"],
          },
          EMAIL_THREAD_LIST_GET_CALL_ID,
        ]],
      },
      methodName: "Thread/get",
      fetchImpl: context.fetchImpl,
      maxResponseBytes: 2 * 1024 * 1024,
    });
    const result = parseThreadMemberIds(threadResponse, requestedThreadIds);
    for (const threadId of result.missingThreadIds) {
      staleThreadIds.add(threadId);
    }
    for (const [emailId, threadId] of result.threadByEmailId) {
      if (threadByEmailId.has(emailId)) {
        throw new JmapPocError("The JMAP API returned duplicate thread members.");
      }
      threadByEmailId.set(emailId, threadId);
      emailIds.push(emailId);
    }
  }
  const threads = { emailIds, threadByEmailId };
  const aggregateByThread = new Map<string, { isUnread: boolean; isStarred: boolean }>();
  const staleEmailIds = new Set<string>();
  const batchSize = maxObjectsInGet(context);

  for (let start = 0; start < threads.emailIds.length; start += batchSize) {
    const emailIds = threads.emailIds.slice(start, start + batchSize);
    const stateResponse = await postJmapApi({
      apiUrl: context.apiUrl,
      authorization: context.authorization,
      requestBody: {
        using: [CORE_CAPABILITY, MAIL_CAPABILITY],
        methodCalls: [[
          "Email/get",
          {
            accountId: context.accountId,
            ids: emailIds,
            properties: ["id", "threadId", "keywords"],
          },
          EMAIL_THREAD_STATE_GET_CALL_ID,
        ]],
      },
      methodName: "Email/get thread state",
      fetchImpl: context.fetchImpl,
      maxResponseBytes: 512 * 1024,
    });
    const { payload } = getMethodResponse(
      stateResponse,
      EMAIL_THREAD_STATE_GET_CALL_ID,
      "Email/get",
    );
    if (!Array.isArray(payload.list)) {
      throw new JmapPocError("The JMAP API returned invalid thread state.");
    }
    if (!Array.isArray(payload.notFound)) {
      throw new JmapPocError("The JMAP API returned invalid thread state.");
    }

    const requested = new Set(emailIds);
    const received = new Set<string>();
    const notFound = new Set<string>();
    for (const rawId of payload.notFound) {
      if (
        typeof rawId !== "string" ||
        !requested.has(rawId) ||
        notFound.has(rawId)
      ) {
        throw new JmapPocError("The JMAP API returned invalid thread state.");
      }
      notFound.add(rawId);
      staleEmailIds.add(rawId);
    }
    for (const rawEmail of payload.list) {
      const email = objectValue(rawEmail);
      if (
        !email ||
        typeof email.id !== "string" ||
        !requested.has(email.id) ||
        received.has(email.id) ||
        notFound.has(email.id)
      ) {
        throw new JmapPocError("The JMAP API returned invalid thread state.");
      }
      received.add(email.id);
      if (email.threadId !== threads.threadByEmailId.get(email.id)) {
        staleEmailIds.add(email.id);
        continue;
      }

      const keywords = objectValue(email.keywords) ?? {};
      const current = aggregateByThread.get(email.threadId as string) ?? {
        isUnread: false,
        isStarred: false,
      };
      current.isUnread ||= keywords["$seen"] !== true;
      current.isStarred ||= keywords["$flagged"] === true;
      aggregateByThread.set(email.threadId as string, current);
    }
    if (emailIds.some((emailId) => !received.has(emailId) && !notFound.has(emailId))) {
      throw new JmapPocError("The JMAP API omitted thread member state.");
    }
  }

  for (const message of messages) {
    if (
      staleThreadIds.has(message.threadId) ||
      threadByEmailId.get(message.id) !== message.threadId
    ) {
      staleEmailIds.add(message.id);
    }
  }

  return messages.flatMap((message) => {
    if (staleEmailIds.has(message.id)) return [];
    const aggregate = aggregateByThread.get(message.threadId);
    return aggregate ? [{ ...message, ...aggregate }] : [];
  });
}

async function fetchEmailPage({
  context,
  mailboxId,
  position,
  searchText,
  searchScope = "all",
  includeThreadState = false,
}: {
  context: JmapApiContext;
  mailboxId: string;
  position: number;
  searchText?: string;
  searchScope?: "all" | "mailbox";
  includeThreadState?: boolean;
}): Promise<{ ids: string[]; total: number | null; messages: JmapEmailSummary[] }> {
  const { apiUrl, accountId, authorization, fetchImpl } = context;
  validateMailboxListingPosition(position);
  const getBatchSize = maxObjectsInGet(context);

  const responseJson = await postJmapApi({
    apiUrl,
    authorization,
    requestBody: emailPageRequest(
      accountId,
      mailboxId,
      position,
      searchText,
      searchScope,
      getBatchSize >= MAIL_PAGE_SIZE,
    ),
    methodName: getBatchSize >= MAIL_PAGE_SIZE
      ? "Email/query and Email/get"
      : "Email/query",
    fetchImpl,
  });
  const query = parseEmailQuery(responseJson);
  const messages: JmapEmailSummary[] = [];
  if (getBatchSize >= MAIL_PAGE_SIZE) {
    messages.push(...parseEmailSummaries(responseJson, query.ids));
  } else {
    for (let start = 0; start < query.ids.length; start += getBatchSize) {
      const emailIds = query.ids.slice(start, start + getBatchSize);
      const summaryResponse = await postJmapApi({
        apiUrl,
        authorization,
        requestBody: emailSummaryGetRequest(accountId, emailIds),
        methodName: "Email/get mailbox summaries",
        fetchImpl,
      });
      messages.push(...parseEmailSummaries(summaryResponse, emailIds));
    }
  }
  return {
    ...query,
    messages: includeThreadState
      ? await aggregateThreadSummaryState(context, messages)
      : messages,
  };
}

interface JmapBodyPart {
  partId: string;
  type: string | null;
  name: string | null;
  size: number | null;
}

function parseBodyParts(value: unknown): JmapBodyPart[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((rawPart) => {
    if (!rawPart || typeof rawPart !== "object" || Array.isArray(rawPart)) {
      return [];
    }
    const part = rawPart as Record<string, unknown>;
    if (
      typeof part.partId !== "string" ||
      part.partId.length === 0 ||
      part.partId.length > 256
    ) {
      return [];
    }
    return [
      {
        partId: part.partId,
        type: boundedString(part.type, 128),
        name: boundedString(part.name, 256),
        size:
          typeof part.size === "number" &&
          Number.isSafeInteger(part.size) &&
          part.size >= 0
            ? part.size
            : null,
      },
    ];
  });
}

function firstBodyValue(
  parts: JmapBodyPart[],
  bodyValues: Record<string, unknown>,
  preferredType: string,
): { value: string | null; truncated: boolean } {
  const candidates = parts.filter(
    (part) => part.type?.toLowerCase() === preferredType,
  );
  for (const part of candidates) {
    const rawBodyValue = bodyValues[part.partId];
    if (
      !rawBodyValue ||
      typeof rawBodyValue !== "object" ||
      Array.isArray(rawBodyValue)
    ) {
      continue;
    }
    const bodyValue = rawBodyValue as Record<string, unknown>;
    if (
      typeof bodyValue.value !== "string" ||
      bodyValue.isEncodingProblem === true
    ) {
      continue;
    }
    const bounded = bodyValue.value.slice(0, EMAIL_BODY_VALUE_MAX_CHARS);
    return {
      value: bounded,
      truncated:
        bodyValue.isTruncated === true ||
        bodyValue.value.length > EMAIL_BODY_VALUE_MAX_CHARS,
    };
  }
  return { value: null, truncated: false };
}

function parseEmailAttachments(value: unknown): JmapEmailAttachmentSummary[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((rawPart) => {
    if (!rawPart || typeof rawPart !== "object" || Array.isArray(rawPart)) {
      return [];
    }
    const part = rawPart as Record<string, unknown>;
    return [
      {
        name: boundedString(part.name, 256),
        type: boundedString(part.type, 128),
        size:
          typeof part.size === "number" &&
          Number.isSafeInteger(part.size) &&
          part.size >= 0
            ? part.size
            : null,
      },
    ];
  });
}

function parseEmailMailboxIds(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>)
    .filter((id) => id.length > 0 && id.length <= 256)
    .slice(0, 64);
}

function detailGetRequest(accountId: string, emailId: string) {
  return {
    using: [CORE_CAPABILITY, MAIL_CAPABILITY],
    methodCalls: [
      [
        "Email/get",
        {
          accountId,
          ids: [emailId],
          properties: [
            "id",
            "threadId",
            "from",
            "replyTo",
            "to",
            "cc",
            "bcc",
            "subject",
            "sentAt",
            "receivedAt",
            "keywords",
            "messageId",
            "inReplyTo",
            "references",
            "textBody",
            "htmlBody",
            "bodyValues",
            "attachments",
            "mailboxIds",
          ],
          bodyProperties: ["partId", "type", "name", "size"],
          fetchTextBodyValues: true,
          fetchHTMLBodyValues: true,
          maxBodyValueBytes: EMAIL_BODY_VALUE_MAX_BYTES,
        },
        EMAIL_DETAIL_GET_CALL_ID,
      ],
    ],
  };
}

function parseEmailDetail(responseJson: unknown, expectedId: string): JmapEmailDetail {
  const { payload } = getMethodResponse(
    responseJson,
    EMAIL_DETAIL_GET_CALL_ID,
    "Email/get",
  );
  if (!Array.isArray(payload.list)) {
    throw new JmapPocError("The JMAP API returned an invalid email detail response.");
  }

  const rawEmail = payload.list.find(
    (candidate) =>
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      (candidate as Record<string, unknown>).id === expectedId,
  );
  if (!rawEmail) throw new JmapEmailNotFoundError();
  if (typeof rawEmail !== "object" || Array.isArray(rawEmail)) {
    throw new JmapPocError("The JMAP API returned an invalid email detail.");
  }

  const email = rawEmail as Record<string, unknown>;
  const bodyValues =
    email.bodyValues &&
    typeof email.bodyValues === "object" &&
    !Array.isArray(email.bodyValues)
      ? (email.bodyValues as Record<string, unknown>)
      : {};
  const text = firstBodyValue(
    parseBodyParts(email.textBody),
    bodyValues,
    "text/plain",
  );
  const rawHtml = firstBodyValue(
    parseBodyParts(email.htmlBody),
    bodyValues,
    "text/html",
  );
  const safeHtml = rawHtml.value ? sanitizeEmailHtml(rawHtml.value) : null;
  const keywords =
    email.keywords &&
    typeof email.keywords === "object" &&
    !Array.isArray(email.keywords)
      ? (email.keywords as Record<string, unknown>)
      : {};

  return {
    id: expectedId,
    threadId:
      typeof email.threadId === "string" &&
      email.threadId.length > 0 &&
      email.threadId.length <= 256
        ? email.threadId
        : expectedId,
    from: parseEmailAddresses(email.from),
    replyTo: parseEmailAddresses(email.replyTo),
    to: parseEmailAddresses(email.to),
    cc: parseEmailAddresses(email.cc),
    bcc: parseEmailAddresses(email.bcc),
    subject: boundedString(email.subject, 512),
    sentAt: parseReceivedAt(email.sentAt),
    receivedAt: parseReceivedAt(email.receivedAt),
    isUnread: keywords["$seen"] !== true,
    isStarred: keywords["$flagged"] === true,
    isDraft: keywords["$draft"] === true,
    messageId: parseMessageIds(email.messageId),
    inReplyTo: parseMessageIds(email.inReplyTo),
    references: parseMessageIds(email.references),
    textBody: text.value,
    htmlBody: safeHtml?.html ?? null,
    externalLinks: safeHtml?.externalLinks ?? [],
    bodyTruncated: text.truncated || rawHtml.truncated,
    attachments: parseEmailAttachments(email.attachments),
    mailboxIds: parseEmailMailboxIds(email.mailboxIds),
  };
}

function emailMarkReadRequest(accountId: string, emailId: string) {
  return {
    using: [CORE_CAPABILITY, MAIL_CAPABILITY],
    methodCalls: [
      [
        "Email/set",
        {
          accountId,
          update: {
            [emailId]: { "keywords/$seen": true },
          },
        },
        EMAIL_MARK_READ_CALL_ID,
      ],
    ],
  };
}

function verifyEmailMarkRead(responseJson: unknown, emailId: string): void {
  const { payload } = getMethodResponse(
    responseJson,
    EMAIL_MARK_READ_CALL_ID,
    "Email/set",
  );
  const notUpdated =
    payload.notUpdated &&
    typeof payload.notUpdated === "object" &&
    !Array.isArray(payload.notUpdated)
      ? (payload.notUpdated as Record<string, unknown>)[emailId]
      : undefined;
  if (notUpdated && typeof notUpdated === "object" && !Array.isArray(notUpdated)) {
    const error = notUpdated as Record<string, unknown>;
    if (error.type === "notFound") throw new JmapEmailNotFoundError();
    throw new JmapPocError("The JMAP API could not update the message read state.");
  }

  const updated =
    payload.updated &&
    typeof payload.updated === "object" &&
    !Array.isArray(payload.updated)
      ? payload.updated as Record<string, unknown>
      : {};
  if (!Object.hasOwn(updated, emailId)) {
    throw new JmapPocError("The JMAP API did not confirm the message read state.");
  }
}

interface JmapApiContext {
  apiUrl: URL;
  accountId: string;
  capabilities: Record<string, unknown>;
  accountCapabilities: Record<string, unknown>;
  authorization: string;
  fetchImpl: typeof fetch;
}

async function createJmapApiContext({
  sessionUrl,
  trustedOrigins,
  allowInsecureHttp,
  authorization,
  fetchImpl,
}: {
  sessionUrl: string;
  trustedOrigins: string[];
  allowInsecureHttp: boolean;
  authorization: string;
  fetchImpl: typeof fetch;
}): Promise<JmapApiContext> {
  const parsedSessionUrl = parseUrl(sessionUrl, undefined, allowInsecureHttp);
  if (parsedSessionUrl.search) {
    throw new JmapPocError(
      "STALWART_JMAP_SESSION_URL cannot include a query string.",
    );
  }

  const allowedOrigins = parseTrustedOrigins(
    trustedOrigins,
    parsedSessionUrl,
    allowInsecureHttp,
  );
  const { session, sessionUrl: resolvedSessionUrl } = await fetchSession({
    sessionUrl: parsedSessionUrl,
    trustedOrigins: allowedOrigins,
    allowInsecureHttp,
    authorization,
    fetchImpl,
  });
  const endpoints = validateSession(
    session,
    resolvedSessionUrl,
    allowedOrigins,
    allowInsecureHttp,
  );

  const accountId = getPrimaryMailAccountId(session);
  const account = session.accounts?.[accountId];
  if (!account) {
    throw new JmapPocError(
      "The authenticated JMAP session did not include account capabilities.",
    );
  }

  return {
    apiUrl: endpoints.apiUrl,
    accountId,
    capabilities: session.capabilities ?? {},
    accountCapabilities: account.accountCapabilities ?? {},
    authorization,
    fetchImpl,
  };
}

function identityGetRequest(accountId: string) {
  return {
    using: [CORE_CAPABILITY, MAIL_CAPABILITY, SUBMISSION_CAPABILITY],
    methodCalls: [
      ["Identity/get", { accountId, ids: null }, IDENTITY_GET_CALL_ID],
    ],
  };
}

function identityAddresses(value: unknown): JmapEmailAddress[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new JmapPocError("The JMAP API returned an invalid Identity address list.");
  }

  return value.slice(0, 50).flatMap((rawAddress) => {
    if (!rawAddress || typeof rawAddress !== "object" || Array.isArray(rawAddress)) {
      return [];
    }
    const address = rawAddress as Record<string, unknown>;
    if (
      typeof address.email !== "string" ||
      address.email.length === 0 ||
      address.email.length > 320 ||
      /[\u0000-\u0020\u007f]/.test(address.email)
    ) {
      return [];
    }
    return [{
      name: boundedString(address.name, 128)?.replace(/[\u0000-\u001f\u007f]/g, "") ?? null,
      email: address.email,
    }];
  });
}

function parseIdentityList(responseJson: unknown): JmapComposeIdentity[] {
  const { payload } = getMethodResponse(
    responseJson,
    IDENTITY_GET_CALL_ID,
    "Identity/get",
  );
  if (!Array.isArray(payload.list)) {
    throw new JmapPocError("The JMAP API returned an invalid Identity/get response.");
  }

  if (payload.list.length > 100) {
    throw new JmapPocError("The JMAP API returned too many sending identities.");
  }

  return payload.list.flatMap((rawIdentity) => {
    if (!rawIdentity || typeof rawIdentity !== "object" || Array.isArray(rawIdentity)) {
      return [];
    }
    const identity = rawIdentity as Record<string, unknown>;
    if (
      typeof identity.id !== "string" ||
      identity.id.length === 0 ||
      identity.id.length > 256 ||
      typeof identity.email !== "string" ||
      identity.email.length === 0 ||
      identity.email.length > 320 ||
      /[\u0000-\u0020\u007f]/.test(identity.email)
    ) {
      return [];
    }

    const isWildcard = /^\*@[A-Za-z0-9.-]+$/.test(identity.email);
    const hasConcreteMailbox = /^[^*@\s]+@[A-Za-z0-9.-]+$/.test(identity.email);
    if (!isWildcard && !hasConcreteMailbox) return [];

    return [{
      id: identity.id,
      name: boundedString(identity.name, 256)?.replace(/[\u0000-\u001f\u007f]/g, "") ?? "",
      email: identity.email,
      isWildcard,
      replyTo: identityAddresses(identity.replyTo),
      bcc: identityAddresses(identity.bcc),
      textSignature: boundedString(identity.textSignature, 16 * 1024) ?? "",
    }];
  });
}

async function fetchIdentityList(context: JmapApiContext): Promise<JmapComposeIdentity[]> {
  const responseJson = await postJmapApi({
    apiUrl: context.apiUrl,
    authorization: context.authorization,
    requestBody: identityGetRequest(context.accountId),
    methodName: "Identity/get",
    fetchImpl: context.fetchImpl,
  });
  return parseIdentityList(responseJson);
}

function hasSubmissionCapability(context: JmapApiContext): boolean {
  const accountCapability = context.accountCapabilities[SUBMISSION_CAPABILITY];
  return (
    Object.hasOwn(context.capabilities, SUBMISSION_CAPABILITY) &&
    Boolean(context.capabilities[SUBMISSION_CAPABILITY]) &&
    typeof accountCapability === "object" &&
    accountCapability !== null &&
    !Array.isArray(accountCapability)
  );
}

function isValidJmapEmailAddress(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > 254 ||
    /[\u0000-\u0020\u007f<>,;:"\\]/.test(value)
  ) {
    return false;
  }
  const at = value.lastIndexOf("@");
  if (at < 1 || at !== value.indexOf("@") || at > 64) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    domain.length === 0 ||
    domain.startsWith(".") ||
    domain.endsWith(".")
  ) {
    return false;
  }
  return domain.split(".").every((label) =>
    label.length > 0 &&
    label.length <= 63 &&
    !label.startsWith("-") &&
    !label.endsWith("-") &&
    /^[\p{L}\p{N}-]+$/u.test(label),
  );
}

function getIdentityFromAddress(
  identity: JmapComposeIdentity,
  requestedFrom: string | undefined,
): string {
  if (!identity.isWildcard) {
    if (
      requestedFrom !== undefined &&
      requestedFrom.toLowerCase() !== identity.email.toLowerCase()
    ) {
      throw new JmapSendRejectedError("identity_invalid");
    }
    return identity.email;
  }

  const identityDomain = identity.email.slice(2).toLowerCase();
  if (
    !requestedFrom ||
    !isValidJmapEmailAddress(requestedFrom) ||
    requestedFrom.slice(requestedFrom.lastIndexOf("@") + 1).toLowerCase() !==
      identityDomain
  ) {
    throw new JmapSendRejectedError("identity_invalid");
  }
  return requestedFrom;
}

function uniqueEmailAddresses(
  addresses: JmapEmailAddress[],
): JmapEmailAddress[] {
  const seen = new Set<string>();
  return addresses.filter((address) => {
    const key = address.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchComposePreflightFromContext(
  context: JmapApiContext,
): Promise<JmapComposePreflight> {
  const submissionAvailable = hasSubmissionCapability(context);
  const mailboxes = await fetchMailboxList(context);
  const draftsMailboxId =
    mailboxes.find((mailbox) => mailbox.role === "drafts")?.id ?? null;
  const sentMailboxId =
    mailboxes.find((mailbox) => mailbox.role === "sent")?.id ?? null;
  const identities = submissionAvailable
    ? await fetchIdentityList(context)
    : [];

  return { submissionAvailable, draftsMailboxId, sentMailboxId, identities };
}

function makeOAuthAuthorization(accessToken: string): string {
  if (
    typeof accessToken !== "string" ||
    !/^[A-Za-z0-9\-._~+/]+=*$/.test(accessToken)
  ) {
    throw new JmapPocError("The OAuth access token is invalid.");
  }
  return `Bearer ${accessToken}`;
}

function validateMailboxListingPosition(position: number): void {
  if (
    !Number.isSafeInteger(position) ||
    position < 0 ||
    position > MAX_MAIL_POSITION ||
    position % MAIL_PAGE_SIZE !== 0
  ) {
    throw new JmapPocError("The email page position is invalid.");
  }
}

/**
 * Performs JMAP session discovery and, unless discoveryOnly is true, the
 * read-only Mailbox/get method. This function never logs request or response
 * data and never follows an API URL redirect.
 *
 */
export async function runJmapPoc({
  sessionUrl: sessionUrlValue,
  trustedOrigins: trustedOriginValues = [],
  allowInsecureHttp = false,
  username = "",
  password = "",
  discoveryOnly = false,
  fetchImpl = fetch,
}: RunJmapPocOptions): Promise<JmapPocResult> {
  const sessionUrl = parseUrl(sessionUrlValue, undefined, allowInsecureHttp);
  if (sessionUrl.search) {
    throw new JmapPocError(
      "STALWART_JMAP_SESSION_URL cannot include a query string.",
    );
  }

  const trustedOrigins = parseTrustedOrigins(
    trustedOriginValues,
    sessionUrl,
    allowInsecureHttp,
  );
  const authorization = makeAuthorization(username, password);

  if (!discoveryOnly && !authorization) {
    throw new JmapPocError(
      "Set a dedicated JMAP test account in .env.local before running the authenticated smoke check.",
    );
  }

  const { session, sessionUrl: resolvedSessionUrl } = await fetchSession({
    sessionUrl,
    trustedOrigins,
    allowInsecureHttp,
    authorization,
    fetchImpl,
  });
  const endpointUrls = validateSession(
    session,
    resolvedSessionUrl,
    trustedOrigins,
    allowInsecureHttp,
  );

  if (discoveryOnly) {
    return {
      authenticated: false,
      endpointOrigins: Object.fromEntries(
        Object.entries(endpointUrls).map(([name, url]) => [name, url.origin]),
      ),
      capabilities: [CORE_CAPABILITY, MAIL_CAPABILITY],
    };
  }

  if (!authorization) {
    throw new JmapPocError(
      "Set a dedicated JMAP test account in .env.local before running the authenticated smoke check.",
    );
  }

  const accountId = getPrimaryMailAccountId(session);
  const mailboxSummary = await fetchMailboxSummary({
    apiUrl: endpointUrls.apiUrl,
    accountId,
    authorization,
    fetchImpl,
  });
  return {
    authenticated: true,
    ...mailboxSummary,
  };
}

export async function runJmapOAuthAccessCheck({
  accessToken,
  sessionUrl = "https://mail.rekad.id/.well-known/jmap",
  trustedOrigins = ["https://mail.rekad.id"],
  allowInsecureHttp = false,
  fetchImpl = fetch,
}: {
  accessToken: string;
  sessionUrl?: string;
  trustedOrigins?: string[];
  allowInsecureHttp?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<{ accountId: string }> {
  const context = await createJmapApiContext({
    sessionUrl,
    trustedOrigins,
    allowInsecureHttp,
    authorization: makeOAuthAuthorization(accessToken),
    fetchImpl,
  });
  await fetchMailboxSummary({
    ...context,
  });

  return { accountId: context.accountId };
}

export async function runJmapOAuthComposePreflight({
  accessToken,
  expectedAccountId,
  sessionUrl = "https://mail.rekad.id/.well-known/jmap",
  trustedOrigins = ["https://mail.rekad.id"],
  allowInsecureHttp = false,
  fetchImpl = fetch,
}: {
  accessToken: string;
  expectedAccountId: string;
  sessionUrl?: string;
  trustedOrigins?: string[];
  allowInsecureHttp?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<JmapComposePreflight> {
  const context = await createJmapApiContext({
    sessionUrl,
    trustedOrigins,
    allowInsecureHttp,
    authorization: makeOAuthAuthorization(accessToken),
    fetchImpl,
  });
  if (context.accountId !== expectedAccountId) {
    throw new JmapAccountMismatchError();
  }

  return fetchComposePreflightFromContext(context);
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function rejectionReason(value: unknown): JmapSendRejectionReason {
  const error = objectValue(value);
  switch (error?.type) {
    case "forbiddenFrom":
    case "forbiddenMailFrom":
      return "sender_forbidden";
    case "forbiddenToSend":
      return "send_forbidden";
    case "tooManyRecipients":
      return "too_many_recipients";
    case "noRecipients":
      return "no_recipients";
    case "invalidRecipients":
    case "invalidEmail":
      return "recipient_invalid";
    case "tooLarge":
      return "message_too_large";
    default:
      return "server_rejected";
  }
}

function getCreatedId(
  payload: Record<string, unknown>,
  creationId: string,
  typeName: string,
): string {
  const created = objectValue(payload.created);
  const createdItem = objectValue(created?.[creationId]);
  if (typeof createdItem?.id === "string" && createdItem.id.length > 0) {
    return createdItem.id;
  }
  const notCreated = objectValue(payload.notCreated);
  if (notCreated && Object.hasOwn(notCreated, creationId)) {
    throw new JmapSendRejectedError(rejectionReason(notCreated[creationId]));
  }
  throw new JmapPocError(`The JMAP API did not confirm ${typeName} creation.`);
}

function emailCreateDraftRequest(
  accountId: string,
  draftsMailboxId: string,
  identity: JmapComposeIdentity,
  fromEmail: string,
  input: JmapMailSendInput,
  allowNoRecipients = false,
  callId = EMAIL_CREATE_DRAFT_CALL_ID,
) {
  const bcc = uniqueEmailAddresses([...identity.bcc, ...input.bcc]);
  const recipients = [...input.to, ...input.cc, ...bcc];
  if (recipients.length === 0 && !allowNoRecipients) {
    throw new JmapSendRejectedError("no_recipients");
  }
  if (
    recipients.length > 50 ||
    recipients.some((address) => !isValidJmapEmailAddress(address.email))
  ) {
    throw new JmapSendRejectedError(
      recipients.length > 50 ? "too_many_recipients" : "recipient_invalid",
    );
  }
  if (
    input.subject.length > 998 ||
    /[\u0000-\u0008\u000a-\u001f\u007f]/.test(input.subject) ||
    Buffer.byteLength(input.subject, "utf8") > 998
  ) {
    throw new JmapSendRejectedError("message_too_large");
  }
  if (
    Buffer.byteLength(input.body, "utf8") > EMAIL_BODY_VALUE_MAX_BYTES ||
    input.body.includes("\u0000")
  ) {
    throw new JmapSendRejectedError("message_too_large");
  }

  const email: Record<string, unknown> = {
    mailboxIds: { [draftsMailboxId]: true },
    keywords: { $draft: true, $seen: true },
    from: [{ name: identity.name || null, email: fromEmail }],
    to: input.to,
    cc: input.cc,
    bcc,
    subject: input.subject,
    bodyStructure: { type: "text/plain", partId: "rekad-text-body" },
    bodyValues: { "rekad-text-body": { value: input.body } },
  };
  if (identity.replyTo.length > 0) email.replyTo = identity.replyTo;
  if (input.inReplyTo && input.inReplyTo.length > 0) {
    email.inReplyTo = input.inReplyTo;
  }
  if (input.references && input.references.length > 0) {
    email.references = input.references;
  }

  return {
    using: [CORE_CAPABILITY, MAIL_CAPABILITY],
    methodCalls: [
      [
        "Email/set",
        { accountId, create: { draft: email } },
        callId,
      ],
    ],
  };
}

async function createOAuthJmapContext({
  accessToken,
  expectedAccountId,
  sessionUrl,
  trustedOrigins,
  allowInsecureHttp,
  fetchImpl,
}: {
  accessToken: string;
  expectedAccountId: string;
  sessionUrl: string;
  trustedOrigins: string[];
  allowInsecureHttp: boolean;
  fetchImpl: typeof fetch;
}): Promise<JmapApiContext> {
  const context = await createJmapApiContext({
    sessionUrl,
    trustedOrigins,
    allowInsecureHttp,
    authorization: makeOAuthAuthorization(accessToken),
    fetchImpl,
  });
  if (context.accountId !== expectedAccountId) {
    throw new JmapAccountMismatchError();
  }
  return context;
}

async function getDraftFromContext(
  context: JmapApiContext,
  draftsMailboxId: string,
  emailId: string,
): Promise<{ draft: JmapMailDraft; state: string; sendPending: boolean }> {
  validateEmailId(emailId);
  const responseJson = await postJmapApi({
    apiUrl: context.apiUrl,
    authorization: context.authorization,
    requestBody: detailGetRequest(context.accountId, emailId),
    methodName: "Email/get",
    fetchImpl: context.fetchImpl,
    maxResponseBytes: EMAIL_DETAIL_RESPONSE_MAX_BYTES,
  });
  const { payload } = getMethodResponse(
    responseJson,
    EMAIL_DETAIL_GET_CALL_ID,
    "Email/get",
  );
  if (typeof payload.state !== "string" || payload.state.length === 0 || payload.state.length > 256) {
    throw new JmapPocError("The JMAP API returned an invalid email state.");
  }
  const detail = parseEmailDetail(responseJson, emailId);
  if (!detail.isDraft || !detail.mailboxIds.includes(draftsMailboxId)) {
    throw new JmapEmailNotFoundError();
  }
  return {
    state: payload.state,
    sendPending: hasDraftSendMarker(payload.list, emailId),
    draft: {
      id: detail.id,
      from: detail.from,
      to: detail.to,
      cc: detail.cc,
      bcc: detail.bcc,
      subject: detail.subject ?? "",
      body: detail.textBody ?? "",
      inReplyTo: detail.inReplyTo,
      references: detail.references,
    },
  };
}

function hasDraftSendMarker(list: unknown, emailId: string): boolean {
  if (!Array.isArray(list)) return false;
  const email = list.map(objectValue).find((item) => item?.id === emailId);
  const keywords = objectValue(email?.keywords) ?? {};
  return Object.entries(keywords).some(([keyword, value]) =>
    keyword.startsWith(DRAFT_SEND_PENDING_PREFIX) && value === true,
  );
}

function sameAddresses(
  left: JmapEmailAddress[],
  right: JmapEmailAddress[],
): boolean {
  return left.length === right.length && left.every((address, index) =>
    address.email.toLowerCase() === right[index]?.email.toLowerCase(),
  );
}

function sameStringList(left: string[], right: string[] = []): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function draftSendMarkerForAttempt(attemptKey: string): string {
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(attemptKey) ||
    Buffer.from(attemptKey, "base64url").length !== 32
  ) {
    throw new JmapPocError("The mail send attempt key is invalid.");
  }
  const digest = createHash("sha256")
    .update("rekad-mail-draft-send-lock\0")
    .update(attemptKey)
    .digest("hex");
  return `${DRAFT_SEND_PENDING_PREFIX}${digest}`;
}

async function getEmailSendState(
  context: JmapApiContext,
  emailId: string,
): Promise<{
  state: string;
  keywords: Record<string, unknown>;
  mailboxIds: Record<string, unknown>;
}> {
  const responseJson = await postJmapApi({
    apiUrl: context.apiUrl,
    authorization: context.authorization,
    requestBody: {
      using: [CORE_CAPABILITY, MAIL_CAPABILITY],
      methodCalls: [[
        "Email/get",
        {
          accountId: context.accountId,
          ids: [emailId],
          properties: ["id", "keywords", "mailboxIds"],
        },
        EMAIL_SEND_MARKER_GET_CALL_ID,
      ]],
    },
    methodName: "Email/get send state",
    fetchImpl: context.fetchImpl,
    maxResponseBytes: 256 * 1024,
  });
  const { payload } = getMethodResponse(
    responseJson,
    EMAIL_SEND_MARKER_GET_CALL_ID,
    "Email/get",
  );
  if (
    typeof payload.state !== "string" ||
    payload.state.length === 0 ||
    !Array.isArray(payload.list)
  ) {
    throw new JmapPocError("The JMAP API returned invalid email state.");
  }
  const email = payload.list.map(objectValue).find((item) => item?.id === emailId);
  if (!email) throw new JmapEmailNotFoundError();
  return {
    state: payload.state,
    keywords: objectValue(email.keywords) ?? {},
    mailboxIds: objectValue(email.mailboxIds) ?? {},
  };
}

async function updateEmailKeywordWithState({
  context,
  emailId,
  state,
  keyword,
  value,
  callId,
}: {
  context: JmapApiContext;
  emailId: string;
  state: string;
  keyword: string;
  value: boolean | null;
  callId: string;
}): Promise<void> {
  const responseJson = await postJmapApi({
    apiUrl: context.apiUrl,
    authorization: context.authorization,
    requestBody: {
      using: [CORE_CAPABILITY, MAIL_CAPABILITY],
      methodCalls: [[
        "Email/set",
        {
          accountId: context.accountId,
          ifInState: state,
          update: {
            [emailId]: { [`keywords/${keyword}`]: value },
          },
        },
        callId,
      ]],
    },
    methodName: "Email/set",
    fetchImpl: context.fetchImpl,
    maxResponseBytes: 256 * 1024,
  });

  let payload: Record<string, unknown>;
  try {
    payload = getMethodResponse(responseJson, callId, "Email/set").payload;
  } catch (error) {
    if (error instanceof JmapStateMismatchError) {
      throw new JmapDraftMismatchError();
    }
    throw error;
  }
  const notUpdated = objectValue(payload.notUpdated);
  const error = objectValue(notUpdated?.[emailId]);
  if (error) {
    if (error.type === "notFound") throw new JmapEmailNotFoundError();
    if (error.type === "stateMismatch") throw new JmapDraftMismatchError();
    throw new JmapPocError("The JMAP API rejected the email update.");
  }
  const updated = objectValue(payload.updated);
  if (!updated || !Object.hasOwn(updated, emailId)) {
    throw new JmapPocError("The JMAP API did not confirm the email update.");
  }
}

async function markDraftSendPending(
  context: JmapApiContext,
  draftsMailboxId: string,
  emailId: string,
  marker: string,
): Promise<void> {
  const current = await getEmailSendState(context, emailId);
  if (
    current.keywords["$draft"] !== true ||
    current.mailboxIds[draftsMailboxId] !== true
  ) {
    throw new JmapEmailNotFoundError();
  }
  if (Object.entries(current.keywords).some(([keyword, value]) =>
    keyword.startsWith(DRAFT_SEND_PENDING_PREFIX) && value === true,
  )) {
    throw new JmapDraftMismatchError();
  }
  await updateEmailKeywordWithState({
    context,
    emailId,
    state: current.state,
    keyword: marker,
    value: true,
    callId: EMAIL_SEND_MARKER_SET_CALL_ID,
  });
}

async function clearDraftSendPending(
  context: JmapApiContext,
  emailId: string,
  marker: string,
): Promise<void> {
  const current = await getEmailSendState(context, emailId);
  if (current.keywords[marker] !== true) return;
  await updateEmailKeywordWithState({
    context,
    emailId,
    state: current.state,
    keyword: marker,
    value: null,
    callId: EMAIL_SEND_MARKER_SET_CALL_ID,
  });
}

function draftMatchesSend(
  draft: JmapMailDraft,
  identity: JmapComposeIdentity,
  fromEmail: string,
  input: JmapMailSendInput,
): boolean {
  const expectedBcc = uniqueEmailAddresses([...identity.bcc, ...input.bcc]);
  return (
    draft.from[0]?.email.toLowerCase() === fromEmail.toLowerCase() &&
    sameAddresses(draft.to, input.to) &&
    sameAddresses(draft.cc, input.cc) &&
    sameAddresses(draft.bcc, expectedBcc) &&
    draft.subject === input.subject &&
    draft.body === input.body &&
    sameStringList(draft.inReplyTo, input.inReplyTo) &&
    sameStringList(draft.references, input.references)
  );
}

async function destroyEmailInContext(
  context: JmapApiContext,
  emailId: string,
  callId: string,
  ifInState: string,
): Promise<void> {
  const responseJson = await postJmapApi({
    apiUrl: context.apiUrl,
    authorization: context.authorization,
    requestBody: {
      using: [CORE_CAPABILITY, MAIL_CAPABILITY],
      methodCalls: [[
        "Email/set",
        { accountId: context.accountId, ifInState, destroy: [emailId] },
        callId,
      ]],
    },
    methodName: "Email/set",
    fetchImpl: context.fetchImpl,
    maxResponseBytes: 256 * 1024,
  });
  const { payload } = getMethodResponse(responseJson, callId, "Email/set");
  const destroyed = Array.isArray(payload.destroyed) ? payload.destroyed : [];
  if (!destroyed.includes(emailId)) {
    throw new JmapPocError("The JMAP API did not confirm draft cleanup.");
  }
}

export async function runJmapOAuthGetDraft({
  accessToken,
  expectedAccountId,
  draftId,
  sessionUrl = "https://mail.rekad.id/.well-known/jmap",
  trustedOrigins = ["https://mail.rekad.id"],
  allowInsecureHttp = false,
  fetchImpl = fetch,
}: {
  accessToken: string;
  expectedAccountId: string;
  draftId: string;
  sessionUrl?: string;
  trustedOrigins?: string[];
  allowInsecureHttp?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<JmapMailDraft> {
  const context = await createOAuthJmapContext({
    accessToken,
    expectedAccountId,
    sessionUrl,
    trustedOrigins,
    allowInsecureHttp,
    fetchImpl,
  });
  const draftsMailboxId = (await fetchMailboxList(context))
    .find((mailbox) => mailbox.role === "drafts")?.id;
  if (!draftsMailboxId) throw new JmapEmailNotFoundError();
  return (await getDraftFromContext(context, draftsMailboxId, draftId)).draft;
}

export async function runJmapOAuthSaveDraft({
  accessToken,
  expectedAccountId,
  input,
  draftId,
  sessionUrl = "https://mail.rekad.id/.well-known/jmap",
  trustedOrigins = ["https://mail.rekad.id"],
  allowInsecureHttp = false,
  fetchImpl = fetch,
}: {
  accessToken: string;
  expectedAccountId: string;
  input: JmapMailDraftInput;
  draftId?: string;
  sessionUrl?: string;
  trustedOrigins?: string[];
  allowInsecureHttp?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<{ emailId: string; previousRemoved: boolean }> {
  const context = await createOAuthJmapContext({
    accessToken,
    expectedAccountId,
    sessionUrl,
    trustedOrigins,
    allowInsecureHttp,
    fetchImpl,
  });
  const preflight = await fetchComposePreflightFromContext(context);
  if (!preflight.draftsMailboxId) {
    throw new JmapSendRejectedError("submission_unavailable");
  }
  const identity = preflight.identities.find((item) => item.id === input.identityId);
  if (!identity) throw new JmapSendRejectedError("identity_invalid");
  const fromEmail = getIdentityFromAddress(identity, input.fromEmail);
  if (draftId) await getDraftFromContext(context, preflight.draftsMailboxId, draftId);

  const responseJson = await postJmapApi({
    apiUrl: context.apiUrl,
    authorization: context.authorization,
    requestBody: emailCreateDraftRequest(
      context.accountId,
      preflight.draftsMailboxId,
      identity,
      fromEmail,
      input,
      true,
      EMAIL_DRAFT_CREATE_CALL_ID,
    ),
    methodName: "Email/set",
    fetchImpl,
  });
  const { payload } = getMethodResponse(
    responseJson,
    EMAIL_DRAFT_CREATE_CALL_ID,
    "Email/set",
  );
  const emailId = getCreatedId(payload, "draft", "draft");
  let previousRemoved = true;
  if (draftId) {
    try {
      // Re-read after creating the replacement. Another client may have
      // submitted the previous revision since the initial validation.
      const previous = await getDraftFromContext(
        context,
        preflight.draftsMailboxId,
        draftId,
      );
      if (previous.sendPending) {
        previousRemoved = false;
      } else {
        await destroyEmailInContext(
          context,
          draftId,
          EMAIL_DRAFT_DESTROY_CALL_ID,
          previous.state,
        );
      }
    } catch {
      previousRemoved = false;
    }
  }
  return { emailId, previousRemoved };
}

export async function runJmapOAuthCreateDraft({
  accessToken,
  expectedAccountId,
  input,
  existingDraftId,
  sessionUrl = "https://mail.rekad.id/.well-known/jmap",
  trustedOrigins = ["https://mail.rekad.id"],
  allowInsecureHttp = false,
  fetchImpl = fetch,
}: {
  accessToken: string;
  expectedAccountId: string;
  input: JmapMailSendInput;
  existingDraftId?: string;
  sessionUrl?: string;
  trustedOrigins?: string[];
  allowInsecureHttp?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<{ emailId: string }> {
  const context = await createOAuthJmapContext({
    accessToken,
    expectedAccountId,
    sessionUrl,
    trustedOrigins,
    allowInsecureHttp,
    fetchImpl,
  });
  const preflight = await fetchComposePreflightFromContext(context);
  if (
    !preflight.submissionAvailable ||
    !preflight.draftsMailboxId ||
    !preflight.sentMailboxId
  ) {
    throw new JmapSendRejectedError("submission_unavailable");
  }

  const identity = preflight.identities.find((item) => item.id === input.identityId);
  if (!identity) throw new JmapSendRejectedError("identity_invalid");
  const fromEmail = getIdentityFromAddress(identity, input.fromEmail);

  if (existingDraftId) {
    const draftSnapshot = await getDraftFromContext(
      context,
      preflight.draftsMailboxId,
      existingDraftId,
    );
    if (
      draftSnapshot.sendPending ||
      !draftMatchesSend(draftSnapshot.draft, identity, fromEmail, input)
    ) {
      throw new JmapDraftMismatchError();
    }
    return { emailId: existingDraftId };
  }

  const responseJson = await postJmapApi({
    apiUrl: context.apiUrl,
    authorization: context.authorization,
    requestBody: emailCreateDraftRequest(
      context.accountId,
      preflight.draftsMailboxId,
      identity,
      fromEmail,
      input,
    ),
    methodName: "Email/set",
    fetchImpl,
  });
  const { payload } = getMethodResponse(
    responseJson,
    EMAIL_CREATE_DRAFT_CALL_ID,
    "Email/set",
  );
  return { emailId: getCreatedId(payload, "draft", "draft") };
}

function responseEntries(responseJson: unknown, callId: string): unknown[][] {
  const responses = objectValue(responseJson)?.methodResponses;
  if (!Array.isArray(responses)) {
    throw new JmapPocError("The JMAP API response did not contain methodResponses.");
  }
  return responses.filter(
    (entry): entry is unknown[] =>
      Array.isArray(entry) && entry[2] === callId,
  );
}

function isEmailUpdateConfirmed(response: unknown, emailId: string): boolean {
  const entry = responseEntries(response, EMAIL_SUBMISSION_SET_CALL_ID).find(
    (item) => item[0] === "Email/set",
  );
  if (!entry) return false;
  const payload = objectValue(entry[1]);
  const updated = objectValue(payload?.updated);
  return Boolean(updated && Object.hasOwn(updated, emailId));
}

export async function runJmapOAuthSubmitEmail({
  accessToken,
  expectedAccountId,
  identityId,
  emailId,
  attemptKey,
  sessionUrl = "https://mail.rekad.id/.well-known/jmap",
  trustedOrigins = ["https://mail.rekad.id"],
  allowInsecureHttp = false,
  fetchImpl = fetch,
}: {
  accessToken: string;
  expectedAccountId: string;
  identityId: string;
  emailId: string;
  attemptKey: string;
  sessionUrl?: string;
  trustedOrigins?: string[];
  allowInsecureHttp?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<{ submissionId: string; sentUpdateApplied: boolean }> {
  validateEmailId(emailId);
  const context = await createOAuthJmapContext({
    accessToken,
    expectedAccountId,
    sessionUrl,
    trustedOrigins,
    allowInsecureHttp,
    fetchImpl,
  });
  const preflight = await fetchComposePreflightFromContext(context);
  if (
    !preflight.submissionAvailable ||
    !preflight.draftsMailboxId ||
    !preflight.sentMailboxId
  ) {
    throw new JmapSendRejectedError("submission_unavailable");
  }
  if (!preflight.identities.some((identity) => identity.id === identityId)) {
    throw new JmapSendRejectedError("identity_invalid");
  }
  const marker = draftSendMarkerForAttempt(attemptKey);
  // Reserve this revision before submission: our autosave path either wins
  // first and makes this fail before sending, or sees this marker and leaves
  // the revision intact.
  await markDraftSendPending(
    context,
    preflight.draftsMailboxId,
    emailId,
    marker,
  );

  const responseJson = await postJmapApi({
    apiUrl: context.apiUrl,
    authorization: context.authorization,
    requestBody: {
      using: [CORE_CAPABILITY, MAIL_CAPABILITY, SUBMISSION_CAPABILITY],
      methodCalls: [[
        "EmailSubmission/set",
        {
          accountId: context.accountId,
          create: {
            submission: { identityId, emailId },
          },
          onSuccessUpdateEmail: {
            "#submission": {
              [`mailboxIds/${preflight.draftsMailboxId}`]: null,
              [`mailboxIds/${preflight.sentMailboxId}`]: true,
              "keywords/$draft": null,
              [`keywords/${marker}`]: null,
            },
          },
        },
        EMAIL_SUBMISSION_SET_CALL_ID,
      ]],
    },
    methodName: "EmailSubmission/set",
    fetchImpl,
  });

  const submissionResponses = responseEntries(
    responseJson,
    EMAIL_SUBMISSION_SET_CALL_ID,
  );
  const primaryResponses = submissionResponses.filter((entry) =>
    entry[0] === "EmailSubmission/set" || entry[0] === "error",
  );
  const emailUpdateResponses = submissionResponses.filter(
    (entry) => entry[0] === "Email/set",
  );
  const unexpectedResponses = submissionResponses.filter((entry) =>
    entry[0] !== "EmailSubmission/set" &&
    entry[0] !== "error" &&
    entry[0] !== "Email/set",
  );
  if (
    primaryResponses.length !== 1 ||
    emailUpdateResponses.length > 1 ||
    unexpectedResponses.length > 0
  ) {
    throw new JmapPocError("The JMAP API returned invalid email submission responses.");
  }
  const submissionResponse = primaryResponses[0];
  if (!submissionResponse) {
    throw new JmapPocError("The JMAP API returned an invalid email submission response.");
  }
  if (submissionResponse[0] === "error") {
    if (emailUpdateResponses.length > 0) {
      throw new JmapPocError("The JMAP API returned an ambiguous submission response.");
    }
    const errorPayload = objectValue(submissionResponse[1]);
    const errorType = errorPayload?.type;
    if (
      typeof errorType !== "string" ||
      !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(errorType)
    ) {
      throw new JmapPocError("The JMAP API returned an invalid submission error.");
    }
    if (errorType === "serverPartialFail") {
      throw new JmapPocError("The JMAP API reported a partial submission failure.");
    }
    try {
      await clearDraftSendPending(context, emailId, marker);
    } catch {
      // Preserve the marker if cleanup cannot be confirmed.
    }
    throw new JmapSendRejectedError("server_rejected");
  }
  if (submissionResponse[0] !== "EmailSubmission/set") {
    throw new JmapPocError("The JMAP API returned an invalid email submission response.");
  }
  const payload = objectValue(submissionResponse[1]);
  if (!payload) {
    throw new JmapPocError("The JMAP API returned an invalid email submission response.");
  }
  let submissionId: string;
  try {
    submissionId = getCreatedId(payload, "submission", "email submission");
  } catch (error) {
    if (error instanceof JmapSendRejectedError) {
      try {
        await clearDraftSendPending(context, emailId, marker);
      } catch {
        // Keep the pending marker if the rejection cleanup cannot be confirmed.
      }
    }
    throw error;
  }

  return {
    submissionId,
    sentUpdateApplied: isEmailUpdateConfirmed(
      responseJson,
      emailId,
    ),
  };
}

export async function runJmapOAuthUpdateSent({
  accessToken,
  expectedAccountId,
  emailId,
  sessionUrl = "https://mail.rekad.id/.well-known/jmap",
  trustedOrigins = ["https://mail.rekad.id"],
  allowInsecureHttp = false,
  fetchImpl = fetch,
}: {
  accessToken: string;
  expectedAccountId: string;
  emailId: string;
  sessionUrl?: string;
  trustedOrigins?: string[];
  allowInsecureHttp?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  validateEmailId(emailId);
  const context = await createOAuthJmapContext({
    accessToken,
    expectedAccountId,
    sessionUrl,
    trustedOrigins,
    allowInsecureHttp,
    fetchImpl,
  });
  const mailboxes = await fetchMailboxList(context);
  const draftsMailboxId = mailboxes.find((item) => item.role === "drafts")?.id;
  const sentMailboxId = mailboxes.find((item) => item.role === "sent")?.id;
  if (!draftsMailboxId || !sentMailboxId) return false;

  const emailState = await getEmailSendState(context, emailId);
  const update: Record<string, boolean | null> = {
    [`mailboxIds/${draftsMailboxId}`]: null,
    [`mailboxIds/${sentMailboxId}`]: true,
    "keywords/$draft": null,
  };
  for (const [keyword, present] of Object.entries(emailState.keywords)) {
    if (keyword.startsWith(DRAFT_SEND_PENDING_PREFIX) && present === true) {
      update[`keywords/${keyword}`] = null;
    }
  }

  const responseJson = await postJmapApi({
    apiUrl: context.apiUrl,
    authorization: context.authorization,
    requestBody: {
      using: [CORE_CAPABILITY, MAIL_CAPABILITY],
      methodCalls: [[
        "Email/set",
        {
          accountId: context.accountId,
          ifInState: emailState.state,
          update: {
            [emailId]: update,
          },
        },
        EMAIL_UPDATE_SENT_CALL_ID,
      ]],
    },
    methodName: "Email/set",
    fetchImpl,
  });
  const { payload } = getMethodResponse(
    responseJson,
    EMAIL_UPDATE_SENT_CALL_ID,
    "Email/set",
  );
  const updated = objectValue(payload.updated);
  return Boolean(updated && Object.hasOwn(updated, emailId));
}

export async function runJmapOAuthReconcileSend({
  accessToken,
  expectedAccountId,
  emailId,
  sessionUrl = "https://mail.rekad.id/.well-known/jmap",
  trustedOrigins = ["https://mail.rekad.id"],
  allowInsecureHttp = false,
  fetchImpl = fetch,
}: {
  accessToken: string;
  expectedAccountId: string;
  emailId: string;
  sessionUrl?: string;
  trustedOrigins?: string[];
  allowInsecureHttp?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<{ submissionId: string | null; inSentMailbox: boolean }> {
  validateEmailId(emailId);
  const context = await createOAuthJmapContext({
    accessToken,
    expectedAccountId,
    sessionUrl,
    trustedOrigins,
    allowInsecureHttp,
    fetchImpl,
  });
  const preflight = await fetchComposePreflightFromContext(context);
  if (!preflight.submissionAvailable) {
    return { submissionId: null, inSentMailbox: false };
  }

  const responseJson = await postJmapApi({
    apiUrl: context.apiUrl,
    authorization: context.authorization,
    requestBody: {
      using: [CORE_CAPABILITY, MAIL_CAPABILITY, SUBMISSION_CAPABILITY],
      methodCalls: [
        [
          "EmailSubmission/query",
          {
            accountId: context.accountId,
            filter: { emailIds: [emailId] },
            limit: 5,
          },
          EMAIL_SUBMISSION_QUERY_CALL_ID,
        ],
        [
          "Email/get",
          {
            accountId: context.accountId,
            ids: [emailId],
            properties: ["id", "mailboxIds"],
          },
          EMAIL_RECONCILE_GET_CALL_ID,
        ],
      ],
    },
    methodName: "EmailSubmission/query",
    fetchImpl,
  });
  const query = getMethodResponse(
    responseJson,
    EMAIL_SUBMISSION_QUERY_CALL_ID,
    "EmailSubmission/query",
  ).payload;
  const ids = Array.isArray(query.ids)
    ? query.ids.filter((id): id is string => typeof id === "string")
    : [];
  const emailGet = responseEntries(responseJson, EMAIL_RECONCILE_GET_CALL_ID)
    .find((entry) => entry[0] === "Email/get");
  const emailPayload = objectValue(emailGet?.[1]);
  const emailList = Array.isArray(emailPayload?.list) ? emailPayload.list : [];
  const email = emailList
    .map(objectValue)
    .find((item) => item?.id === emailId);
  const mailboxIds = objectValue(email?.mailboxIds);
  const sentMailboxId = preflight.sentMailboxId;

  return {
    submissionId: ids[0] ?? null,
    inSentMailbox: Boolean(
      sentMailboxId && mailboxIds && mailboxIds[sentMailboxId] === true,
    ),
  };
}

export async function runJmapOAuthDestroyDraft({
  accessToken,
  expectedAccountId,
  emailId,
  sessionUrl = "https://mail.rekad.id/.well-known/jmap",
  trustedOrigins = ["https://mail.rekad.id"],
  allowInsecureHttp = false,
  fetchImpl = fetch,
}: {
  accessToken: string;
  expectedAccountId: string;
  emailId: string;
  sessionUrl?: string;
  trustedOrigins?: string[];
  allowInsecureHttp?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  validateEmailId(emailId);
  const context = await createOAuthJmapContext({
    accessToken,
    expectedAccountId,
    sessionUrl,
    trustedOrigins,
    allowInsecureHttp,
    fetchImpl,
  });
  const responseJson = await postJmapApi({
    apiUrl: context.apiUrl,
    authorization: context.authorization,
    requestBody: {
      using: [CORE_CAPABILITY, MAIL_CAPABILITY],
      methodCalls: [[
        "Email/set",
        { accountId: context.accountId, destroy: [emailId] },
        EMAIL_DESTROY_DRAFT_CALL_ID,
      ]],
    },
    methodName: "Email/set",
    fetchImpl,
  });
  const { payload } = getMethodResponse(
    responseJson,
    EMAIL_DESTROY_DRAFT_CALL_ID,
    "Email/set",
  );
  const destroyed = Array.isArray(payload.destroyed) ? payload.destroyed : [];
  if (!destroyed.includes(emailId)) {
    throw new JmapPocError("The JMAP API did not confirm the temporary draft cleanup.");
  }
}

export async function runJmapOAuthMailboxListing({
  accessToken,
  expectedAccountId,
  mailboxId,
  position = 0,
  searchText,
  searchScope = "all",
  sessionUrl = "https://mail.rekad.id/.well-known/jmap",
  trustedOrigins = ["https://mail.rekad.id"],
  allowInsecureHttp = false,
  fetchImpl = fetch,
}: {
  accessToken: string;
  expectedAccountId: string;
  mailboxId?: string;
  position?: number;
  searchText?: string;
  searchScope?: "all" | "mailbox";
  sessionUrl?: string;
  trustedOrigins?: string[];
  allowInsecureHttp?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<JmapMailboxListing> {
  validateMailboxListingPosition(position);
  const context = await createJmapApiContext({
    sessionUrl,
    trustedOrigins,
    allowInsecureHttp,
    authorization: makeOAuthAuthorization(accessToken),
    fetchImpl,
  });
  if (context.accountId !== expectedAccountId) {
    throw new JmapAccountMismatchError();
  }

  const mailboxes = await fetchMailboxList(context);
  const selectedMailbox = mailboxId
    ? mailboxes.find((mailbox) => mailbox.id === mailboxId)
    : mailboxes.find((mailbox) => mailbox.role === "inbox");
  if (!selectedMailbox) {
    if (mailboxId) throw new JmapMailboxNotFoundError();
    throw new JmapPocError("The authenticated mail account has no inbox mailbox.");
  }

  const page = await fetchEmailPage({
    context,
    mailboxId: selectedMailbox.id,
    position,
    searchText,
    searchScope,
    includeThreadState: true,
  });
  return {
    mailboxes,
    selectedMailboxId: selectedMailbox.id,
    position,
    pageSize: MAIL_PAGE_SIZE,
    total: page.total,
    hasMore:
      position < MAX_MAIL_POSITION &&
      (page.total === null
        ? page.ids.length === MAIL_PAGE_SIZE
        : position + page.ids.length < page.total),
    messages: page.messages,
  };
}

async function fetchThreadEmailIds(
  context: JmapApiContext,
  threadId: string,
): Promise<string[]> {
  const responseJson = await postJmapApi({
    apiUrl: context.apiUrl,
    authorization: context.authorization,
    requestBody: {
      using: [CORE_CAPABILITY, MAIL_CAPABILITY],
      methodCalls: [[
        "Thread/get",
        {
          accountId: context.accountId,
          ids: [threadId],
          properties: ["id", "emailIds"],
        },
        EMAIL_THREAD_GET_CALL_ID,
      ]],
    },
    methodName: "Thread/get",
    fetchImpl: context.fetchImpl,
    maxResponseBytes: 256 * 1024,
  });
  const { payload } = getMethodResponse(
    responseJson,
    EMAIL_THREAD_GET_CALL_ID,
    "Thread/get",
  );
  if (!Array.isArray(payload.list)) {
    throw new JmapPocError("The JMAP API returned an invalid thread response.");
  }
  const rawThread = payload.list.find((item) =>
    objectValue(item)?.id === threadId,
  );
  if (!rawThread) throw new JmapEmailNotFoundError();
  const thread = objectValue(rawThread);
  if (!thread || !Array.isArray(thread.emailIds)) {
    throw new JmapPocError("The JMAP API returned an invalid thread response.");
  }
  const emailIds = thread.emailIds.filter(
    (id): id is string => typeof id === "string" && id.length > 0 && id.length <= 256,
  );
  if (emailIds.length !== thread.emailIds.length || emailIds.length === 0) {
    throw new JmapPocError("The JMAP API returned invalid thread members.");
  }
  return [...new Set(emailIds)];
}

function threadEmailGetRequest(accountId: string, emailIds: string[]) {
  return {
    using: [CORE_CAPABILITY, MAIL_CAPABILITY],
    methodCalls: [[
      "Email/get",
      {
        accountId,
        ids: emailIds,
        properties: [
          "id",
          "threadId",
          "from",
          "subject",
          "receivedAt",
          "keywords",
          "preview",
        ],
      },
      EMAIL_THREAD_EMAIL_GET_CALL_ID,
    ]],
  };
}

function parseThreadMessages(
  responseJson: unknown,
  emailIds: string[],
  threadId: string,
): JmapThreadMessageSummary[] {
  const { payload } = getMethodResponse(
    responseJson,
    EMAIL_THREAD_EMAIL_GET_CALL_ID,
    "Email/get",
  );
  if (!Array.isArray(payload.list)) {
    throw new JmapPocError("The JMAP API returned an invalid thread message response.");
  }
  const allowedIds = new Set(emailIds);
  const messages = new Map<string, JmapThreadMessageSummary>();
  for (const rawEmail of payload.list) {
    const email = objectValue(rawEmail);
    if (
      !email ||
      typeof email.id !== "string" ||
      !allowedIds.has(email.id) ||
      messages.has(email.id)
    ) {
      throw new JmapPocError("The JMAP API returned an invalid thread message.");
    }
    const keywords = objectValue(email.keywords) ?? {};
    messages.set(email.id, {
      id: email.id,
      threadId,
      from: parseEmailAddresses(email.from),
      subject: boundedString(email.subject, 512),
      receivedAt: parseReceivedAt(email.receivedAt),
      preview: boundedString(email.preview, 256) ?? "",
      isUnread: keywords["$seen"] !== true,
      isStarred: keywords["$flagged"] === true,
      isDraft: keywords["$draft"] === true,
    });
  }
  return emailIds.flatMap((id) => {
    const message = messages.get(id);
    return message ? [message] : [];
  }).sort((a, b) => (a.receivedAt ?? "").localeCompare(b.receivedAt ?? ""));
}

export async function runJmapOAuthThreadView({
  accessToken,
  expectedAccountId,
  threadId,
  sessionUrl = "https://mail.rekad.id/.well-known/jmap",
  trustedOrigins = ["https://mail.rekad.id"],
  allowInsecureHttp = false,
  fetchImpl = fetch,
}: {
  accessToken: string;
  expectedAccountId: string;
  threadId: string;
  sessionUrl?: string;
  trustedOrigins?: string[];
  allowInsecureHttp?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<JmapThreadView> {
  validateEmailId(threadId);
  const context = await createJmapApiContext({
    sessionUrl,
    trustedOrigins,
    allowInsecureHttp,
    authorization: makeOAuthAuthorization(accessToken),
    fetchImpl,
  });
  if (context.accountId !== expectedAccountId) {
    throw new JmapAccountMismatchError();
  }
  const allIds = await fetchThreadEmailIds(context, threadId);
  const visibleIds = allIds.slice(-MAX_THREAD_EMAILS);
  const messages: JmapThreadMessageSummary[] = [];
  const batchSize = maxObjectsInGet(context);
  for (let start = 0; start < visibleIds.length; start += batchSize) {
    const emailIds = visibleIds.slice(start, start + batchSize);
    const responseJson = await postJmapApi({
      apiUrl: context.apiUrl,
      authorization: context.authorization,
      requestBody: threadEmailGetRequest(context.accountId, emailIds),
      methodName: "Thread/get and Email/get",
      fetchImpl,
      maxResponseBytes: 512 * 1024,
    });
    messages.push(...parseThreadMessages(responseJson, emailIds, threadId));
  }
  return {
    threadId,
    messages: messages.sort((left, right) =>
      (left.receivedAt ?? "").localeCompare(right.receivedAt ?? ""),
    ),
    truncated: allIds.length > visibleIds.length,
  };
}

function escapeJsonPointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

async function getEmailActionState(
  context: JmapApiContext,
  emailIds: string[],
): Promise<Map<string, { mailboxIds: string[] }>> {
  const state = new Map<string, { mailboxIds: string[] }>();
  const batchSize = maxObjectsInGet(context);
  for (let start = 0; start < emailIds.length; start += batchSize) {
    const requestedIds = emailIds.slice(start, start + batchSize);
    const responseJson = await postJmapApi({
      apiUrl: context.apiUrl,
      authorization: context.authorization,
      requestBody: {
        using: [CORE_CAPABILITY, MAIL_CAPABILITY],
        methodCalls: [[
          "Email/get",
          {
            accountId: context.accountId,
            ids: requestedIds,
            properties: ["id", "mailboxIds"],
          },
          EMAIL_ACTION_GET_CALL_ID,
        ]],
      },
      methodName: "Email/get action state",
      fetchImpl: context.fetchImpl,
      maxResponseBytes: 256 * 1024,
    });
    const { payload } = getMethodResponse(
      responseJson,
      EMAIL_ACTION_GET_CALL_ID,
      "Email/get",
    );
    if (!Array.isArray(payload.list)) {
      throw new JmapPocError("The JMAP API returned an invalid email action response.");
    }
    const requested = new Set(requestedIds);
    for (const rawEmail of payload.list) {
      const email = objectValue(rawEmail);
      if (
        !email ||
        typeof email.id !== "string" ||
        !requested.has(email.id) ||
        state.has(email.id)
      ) {
        throw new JmapPocError("The JMAP API returned invalid email action state.");
      }
      const rawMailboxIds = objectValue(email.mailboxIds) ?? {};
      state.set(email.id, {
        mailboxIds: Object.entries(rawMailboxIds)
          .filter(([id, present]) => id.length > 0 && id.length <= 256 && present === true)
          .map(([id]) => id),
      });
    }
    if (requestedIds.some((id) => !state.has(id))) throw new JmapEmailNotFoundError();
  }
  return state;
}

function verifyEmailActionUpdate(responseJson: unknown, emailIds: string[]): void {
  const { payload } = getMethodResponse(
    responseJson,
    EMAIL_ACTION_SET_CALL_ID,
    "Email/set",
  );
  const notUpdated = objectValue(payload.notUpdated) ?? {};
  for (const emailId of emailIds) {
    const error = objectValue(notUpdated[emailId]);
    if (error) {
      if (error.type === "notFound") throw new JmapEmailNotFoundError();
      throw new JmapPocError("The JMAP API rejected a mailbox action.");
    }
  }
  const updated = objectValue(payload.updated) ?? {};
  if (emailIds.some((emailId) => !Object.hasOwn(updated, emailId))) {
    throw new JmapPocError("The JMAP API did not confirm the mailbox action.");
  }
}

export async function runJmapOAuthMailAction({
  accessToken,
  expectedAccountId,
  input,
  sessionUrl = "https://mail.rekad.id/.well-known/jmap",
  trustedOrigins = ["https://mail.rekad.id"],
  allowInsecureHttp = false,
  fetchImpl = fetch,
}: {
  accessToken: string;
  expectedAccountId: string;
  input: JmapMailActionInput;
  sessionUrl?: string;
  trustedOrigins?: string[];
  allowInsecureHttp?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const context = await createJmapApiContext({
    sessionUrl,
    trustedOrigins,
    allowInsecureHttp,
    authorization: makeOAuthAuthorization(accessToken),
    fetchImpl,
  });
  if (context.accountId !== expectedAccountId) {
    throw new JmapAccountMismatchError();
  }

  const inputId = input.emailId ?? input.threadId;
  if (!inputId) throw new JmapPocError("A mail action target is required.");
  validateEmailId(inputId);
  if (input.threadId && input.emailId) {
    throw new JmapPocError("A mail action must target one message or one thread.");
  }
  const emailIds = input.threadId
    ? await fetchThreadEmailIds(context, input.threadId)
    : [input.emailId as string];
  if (emailIds.length > MAX_THREAD_EMAILS) {
    throw new JmapMailActionUnavailableError("thread_too_large");
  }

  const mailboxes = await fetchMailboxList(context);
  const mailboxById = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox]));
  const inbox = mailboxes.find((mailbox) => mailbox.role === "inbox");
  const trash = mailboxes.find((mailbox) => mailbox.role === "trash");
  const source = input.sourceMailboxId
    ? mailboxById.get(input.sourceMailboxId)
    : null;
  const destination = input.destinationMailboxId
    ? mailboxById.get(input.destinationMailboxId)
    : null;
  if (input.sourceMailboxId && !source) throw new JmapMailboxNotFoundError();
  if (input.destinationMailboxId && !destination) {
    throw new JmapMailboxNotFoundError();
  }
  if (input.action === "move" && !destination) {
    throw new JmapPocError("A destination mailbox is required.");
  }
  if (input.action === "archive" && !inbox) {
    throw new JmapMailActionUnavailableError("archive_unavailable");
  }
  if (input.action === "trash" && !trash) {
    throw new JmapMailActionUnavailableError("trash_unavailable");
  }

  const state = await getEmailActionState(context, emailIds);
  const updates: Record<string, Record<string, unknown>> = {};
  for (const emailId of emailIds) {
    const mailboxIds = state.get(emailId)?.mailboxIds ?? [];
    const update: Record<string, unknown> = {};
    switch (input.action) {
      case "mark_read":
        update["keywords/$seen"] = true;
        break;
      case "mark_unread":
        update["keywords/$seen"] = null;
        break;
      case "star":
        update["keywords/$flagged"] = true;
        break;
      case "unstar":
        update["keywords/$flagged"] = null;
        break;
      case "archive": {
        const archive = mailboxes.find((mailbox) => mailbox.role === "archive");
        if (archive && !mailboxIds.includes(archive.id)) {
          update[`mailboxIds/${escapeJsonPointerSegment(archive.id)}`] = true;
        }
        if (mailboxIds.includes(inbox!.id)) {
          update[`mailboxIds/${escapeJsonPointerSegment(inbox!.id)}`] = null;
        }
        const remaining = mailboxIds.filter((id) => id !== inbox!.id);
        if (remaining.length === 0 && !archive) {
          throw new JmapMailActionUnavailableError("archive_unavailable");
        }
        break;
      }
      case "trash": {
        for (const mailboxId of mailboxIds) {
          if (mailboxId !== trash!.id) {
            update[`mailboxIds/${escapeJsonPointerSegment(mailboxId)}`] = null;
          }
        }
        update[`mailboxIds/${escapeJsonPointerSegment(trash!.id)}`] = true;
        break;
      }
      case "move": {
        if (source && source.id !== destination!.id && mailboxIds.includes(source.id)) {
          update[`mailboxIds/${escapeJsonPointerSegment(source.id)}`] = null;
        }
        update[`mailboxIds/${escapeJsonPointerSegment(destination!.id)}`] = true;
        break;
      }
    }
    updates[emailId] = update;
  }

  const responseJson = await postJmapApi({
    apiUrl: context.apiUrl,
    authorization: context.authorization,
    requestBody: {
      using: [CORE_CAPABILITY, MAIL_CAPABILITY],
      methodCalls: [[
        "Email/set",
        { accountId: context.accountId, update: updates },
        EMAIL_ACTION_SET_CALL_ID,
      ]],
    },
    methodName: "Email/set",
    fetchImpl,
    maxResponseBytes: 512 * 1024,
  });
  verifyEmailActionUpdate(responseJson, emailIds);
}

function validateEmailId(emailId: string): void {
  if (
    emailId.length === 0 ||
    emailId.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(emailId)
  ) {
    throw new JmapPocError("The requested email ID is invalid.");
  }
}

export async function runJmapOAuthEmailDetail({
  accessToken,
  expectedAccountId,
  emailId,
  sessionUrl = "https://mail.rekad.id/.well-known/jmap",
  trustedOrigins = ["https://mail.rekad.id"],
  allowInsecureHttp = false,
  fetchImpl = fetch,
}: {
  accessToken: string;
  expectedAccountId: string;
  emailId: string;
  sessionUrl?: string;
  trustedOrigins?: string[];
  allowInsecureHttp?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<JmapEmailDetail> {
  validateEmailId(emailId);
  const context = await createJmapApiContext({
    sessionUrl,
    trustedOrigins,
    allowInsecureHttp,
    authorization: makeOAuthAuthorization(accessToken),
    fetchImpl,
  });
  if (context.accountId !== expectedAccountId) {
    throw new JmapAccountMismatchError();
  }

  const responseJson = await postJmapApi({
    apiUrl: context.apiUrl,
    authorization: context.authorization,
    requestBody: detailGetRequest(context.accountId, emailId),
    methodName: "Email/get",
    fetchImpl,
    maxResponseBytes: EMAIL_DETAIL_RESPONSE_MAX_BYTES,
  });
  return parseEmailDetail(responseJson, emailId);
}

export async function runJmapOAuthMarkEmailRead({
  accessToken,
  expectedAccountId,
  emailId,
  sessionUrl = "https://mail.rekad.id/.well-known/jmap",
  trustedOrigins = ["https://mail.rekad.id"],
  allowInsecureHttp = false,
  fetchImpl = fetch,
}: {
  accessToken: string;
  expectedAccountId: string;
  emailId: string;
  sessionUrl?: string;
  trustedOrigins?: string[];
  allowInsecureHttp?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  validateEmailId(emailId);
  const context = await createJmapApiContext({
    sessionUrl,
    trustedOrigins,
    allowInsecureHttp,
    authorization: makeOAuthAuthorization(accessToken),
    fetchImpl,
  });
  if (context.accountId !== expectedAccountId) {
    throw new JmapAccountMismatchError();
  }

  const responseJson = await postJmapApi({
    apiUrl: context.apiUrl,
    authorization: context.authorization,
    requestBody: emailMarkReadRequest(context.accountId, emailId),
    methodName: "Email/set",
    fetchImpl,
    maxResponseBytes: 256 * 1024,
  });
  verifyEmailMarkRead(responseJson, emailId);
}

export async function runJmapInboxSmoke({
  sessionUrl,
  trustedOrigins = [],
  allowInsecureHttp = false,
  username = "",
  password = "",
  fetchImpl = fetch,
}: {
  sessionUrl: string;
  trustedOrigins?: string[];
  allowInsecureHttp?: boolean;
  username?: string;
  password?: string;
  fetchImpl?: typeof fetch;
}): Promise<JmapInboxSmokeResult> {
  const authorization = makeAuthorization(username, password);
  if (!authorization) {
    throw new JmapPocError(
      "Set a dedicated JMAP test account in .env.local before running the authenticated smoke check.",
    );
  }
  const context = await createJmapApiContext({
    sessionUrl,
    trustedOrigins,
    allowInsecureHttp,
    authorization,
    fetchImpl,
  });
  const mailboxes = await fetchMailboxList(context);
  const inbox = mailboxes.find((mailbox) => mailbox.role === "inbox");
  if (!inbox) {
    throw new JmapPocError("The authenticated test account has no inbox mailbox.");
  }

  const page = await fetchEmailPage({
    context,
    mailboxId: inbox.id,
    position: 0,
  });
  return {
    ...summarizeMailboxes(mailboxes),
    inboxMessageCount: page.ids.length,
    inboxTotal: page.total,
    fetchedSummaryCount: page.messages.length,
  };
}
