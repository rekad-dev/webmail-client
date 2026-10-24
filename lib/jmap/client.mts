import { isIP } from "node:net";

const CORE_CAPABILITY = "urn:ietf:params:jmap:core";
const MAIL_CAPABILITY = "urn:ietf:params:jmap:mail";
const METHOD_CALL_ID = "phase0-mailboxes";
const EMAIL_QUERY_CALL_ID = "phase2-email-query";
const EMAIL_GET_CALL_ID = "phase2-email-get";
const MAX_SESSION_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 15_000;
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
  from: Array<{ name: string | null; email: string }>;
  subject: string | null;
  receivedAt: string | null;
  preview: string;
  isUnread: boolean;
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
}: {
  apiUrl: URL;
  authorization: string;
  requestBody: Record<string, unknown>;
  methodName: string;
  fetchImpl: typeof fetch;
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

  let responseJson: unknown;
  try {
    responseJson = await response.json();
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
) {
  return {
    using: [CORE_CAPABILITY, MAIL_CAPABILITY],
    methodCalls: [
      [
        "Email/query",
        {
          accountId,
          filter: { inMailbox: mailboxId },
          sort: [{ property: "receivedAt", isAscending: false }],
          position,
          limit: MAIL_PAGE_SIZE,
          calculateTotal: true,
        },
        EMAIL_QUERY_CALL_ID,
      ],
      [
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
      ],
    ],
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
  return value.flatMap((rawAddress) => {
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

  const allowedIds = new Set(queryIds);
  const summaries = new Map<string, JmapEmailSummary>();
  for (const rawEmail of payload.list) {
    if (!rawEmail || typeof rawEmail !== "object" || Array.isArray(rawEmail)) {
      throw new JmapPocError("The JMAP API returned an invalid email summary.");
    }
    const email = rawEmail as Record<string, unknown>;
    if (
      typeof email.id !== "string" ||
      !allowedIds.has(email.id) ||
      summaries.has(email.id)
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
      from: parseEmailAddresses(email.from),
      subject: boundedString(email.subject, 512),
      receivedAt: parseReceivedAt(email.receivedAt),
      preview: boundedString(email.preview, 256) ?? "",
      isUnread: keywords["$seen"] !== true,
    });
  }

  return queryIds.flatMap((id) => {
    const summary = summaries.get(id);
    return summary ? [summary] : [];
  });
}

async function fetchEmailPage({
  apiUrl,
  accountId,
  mailboxId,
  position,
  authorization,
  fetchImpl,
}: {
  apiUrl: URL;
  accountId: string;
  mailboxId: string;
  position: number;
  authorization: string;
  fetchImpl: typeof fetch;
}): Promise<{ ids: string[]; total: number | null; messages: JmapEmailSummary[] }> {
  validateMailboxListingPosition(position);

  const responseJson = await postJmapApi({
    apiUrl,
    authorization,
    requestBody: emailPageRequest(accountId, mailboxId, position),
    methodName: "Email/query and Email/get",
    fetchImpl,
  });
  const query = parseEmailQuery(responseJson);
  const messages = parseEmailSummaries(responseJson, query.ids);
  return { ...query, messages };
}

interface JmapApiContext {
  apiUrl: URL;
  accountId: string;
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

  return {
    apiUrl: endpoints.apiUrl,
    accountId: getPrimaryMailAccountId(session),
    authorization,
    fetchImpl,
  };
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

export async function runJmapOAuthMailboxListing({
  accessToken,
  expectedAccountId,
  mailboxId,
  position = 0,
  sessionUrl = "https://mail.rekad.id/.well-known/jmap",
  trustedOrigins = ["https://mail.rekad.id"],
  allowInsecureHttp = false,
  fetchImpl = fetch,
}: {
  accessToken: string;
  expectedAccountId: string;
  mailboxId?: string;
  position?: number;
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
    ...context,
    mailboxId: selectedMailbox.id,
    position,
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
    ...context,
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
