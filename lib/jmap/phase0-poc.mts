import { isIP } from "node:net";

const CORE_CAPABILITY = "urn:ietf:params:jmap:core";
const MAIL_CAPABILITY = "urn:ietf:params:jmap:mail";
const METHOD_CALL_ID = "phase0-mailboxes";
const MAX_SESSION_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 15_000;

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

export class JmapPocError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JmapPocError";
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
      ["Mailbox/get", { accountId, ids: null }, METHOD_CALL_ID],
    ],
  };
}

function summarizeMailboxResponse(responseJson: unknown): {
  mailboxCount: number;
  roles: string[];
} {
  const responses = (responseJson as { methodResponses?: unknown } | null)
    ?.methodResponses;
  if (!Array.isArray(responses)) {
    throw new JmapPocError("The JMAP API response did not contain methodResponses.");
  }

  const result = (responses as unknown[]).find(
    (methodResponse) =>
      Array.isArray(methodResponse) && methodResponse[2] === METHOD_CALL_ID,
  );
  if (!result) {
    throw new JmapPocError("The JMAP API response omitted Mailbox/get.");
  }

  const [methodName, rawPayload] = result as [unknown, unknown, unknown];
  const payload = rawPayload as { type?: unknown; list?: unknown } | null;
  if (methodName === "error") {
    const rawErrorType = payload?.type;
    const errorType =
      typeof rawErrorType === "string" &&
      /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(rawErrorType)
        ? rawErrorType
        : "unknown";
    throw new JmapPocError(`JMAP Mailbox/get failed (${errorType}).`);
  }

  if (methodName !== "Mailbox/get" || !Array.isArray(payload?.list)) {
    throw new JmapPocError("The JMAP API returned an invalid Mailbox/get response.");
  }

  const roleSet = new Set<string>();
  for (const mailbox of payload.list as unknown[]) {
    if (!mailbox || typeof mailbox !== "object" || Array.isArray(mailbox)) {
      continue;
    }
    const role = (mailbox as { role?: unknown }).role;
    if (
      typeof role === "string" &&
      /^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(role)
    ) {
      roleSet.add(role);
    }
  }

  return { mailboxCount: payload.list.length, roles: [...roleSet].sort() };
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

  let response;
  try {
    response = await fetchImpl(endpointUrls.apiUrl, {
      method: "POST",
      headers: {
        authorization,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(mailboxGetRequest(accountId)),
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
      "The advertised JMAP API endpoint redirected. Update trusted endpoint configuration and rediscover the session.",
    );
  }
  if (!response.ok) {
    throw new JmapPocError(`JMAP Mailbox/get returned HTTP ${response.status}.`);
  }

  let responseJson: unknown;
  try {
    responseJson = await response.json();
  } catch {
    throw new JmapPocError("JMAP Mailbox/get returned invalid JSON.");
  }

  return {
    authenticated: true,
    ...summarizeMailboxResponse(responseJson),
  };
}
