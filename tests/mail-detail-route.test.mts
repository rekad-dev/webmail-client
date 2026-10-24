import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { isTrustedAppOrigin } from "../lib/auth/trusted-origin.mts";
import {
  JmapAccountMismatchError,
  JmapEmailNotFoundError,
  type JmapEmailDetail,
} from "../lib/jmap/client.mts";
import {
  createMailDetailHandlers,
  type MailDetailRouteDependencies,
} from "../lib/jmap/mail-detail-route.mts";

const accessToken = randomBytes(32).toString("base64url");
const sessionId = randomBytes(32).toString("base64url");
const detail: JmapEmailDetail = {
  id: "email-1",
  from: [{ name: "Sender", email: "sender@example.test" }],
  to: [],
  cc: [],
  bcc: [],
  subject: "Test subject",
  sentAt: null,
  receivedAt: "2026-05-03T08:16:00.000Z",
  isUnread: true,
  textBody: "Safe plain text",
  htmlBody: "<p>Safe formatted content</p>",
  externalLinks: [],
  bodyTruncated: false,
  attachments: [],
  mailboxIds: ["inbox-id"],
};

function makeHandlers(
  overrides: Partial<MailDetailRouteDependencies> = {},
) {
  const dependencies: MailDetailRouteDependencies = {
    getSessionId: async () => sessionId,
    getAuthenticatedSession: async () => ({
      accessToken,
      accountId: "account-1",
    }),
    revokeSession: async () => undefined,
    getEmailDetail: async () => detail,
    markEmailRead: async () => undefined,
    getJmapSettings: () => ({
      sessionUrl: "https://mail.example.test/.well-known/jmap",
      trustedOrigins: ["https://mail.example.test"],
      allowInsecureHttp: false,
    }),
    isTrustedOrigin: () => true,
    ...overrides,
  };

  return { handlers: createMailDetailHandlers(dependencies), dependencies };
}

function request(
  query = "",
  method = "GET",
  origin?: string,
  requestOrigin = "https://webmail.example.test",
): Request {
  return new Request(
    `${requestOrigin}/api/mail/detail${query}`,
    {
      method,
      ...(origin ? { headers: { origin } } : {}),
    },
  );
}

test("requires an app session and returns uncached message detail", async () => {
  let serviceCount = 0;
  const { handlers } = makeHandlers({
    getSessionId: async () => null,
    getEmailDetail: async () => {
      serviceCount += 1;
      return detail;
    },
  });

  const response = await handlers.GET(request("?emailId=email-1"));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "sign_in_required" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(serviceCount, 0);
});

test("rejects missing and duplicate message IDs before session lookup", async () => {
  let sessionCount = 0;
  const { handlers } = makeHandlers({
    getSessionId: async () => {
      sessionCount += 1;
      return sessionId;
    },
  });

  for (const query of ["", "?emailId=a&emailId=b"]) {
    const response = await handlers.GET(request(query));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_request" });
  }
  assert.equal(sessionCount, 0);
});

test("passes the session account and message ID to the detail service", async () => {
  let receivedOptions: unknown;
  const { handlers } = makeHandlers({
    getEmailDetail: async (options) => {
      receivedOptions = options;
      return detail;
    },
  });

  const response = await handlers.GET(request("?emailId=email-1"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, detail);
  assert.deepEqual(receivedOptions, {
    accessToken,
    expectedAccountId: "account-1",
    emailId: "email-1",
    sessionUrl: "https://mail.example.test/.well-known/jmap",
    trustedOrigins: ["https://mail.example.test"],
    allowInsecureHttp: false,
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(JSON.stringify(body).includes(accessToken), false);
});

test("revokes a session on JMAP account mismatch and fails closed if revoke fails", async () => {
  const revoked: string[] = [];
  const { handlers } = makeHandlers({
    getEmailDetail: async () => {
      throw new JmapAccountMismatchError();
    },
    revokeSession: async (id) => {
      revoked.push(id);
    },
  });

  const response = await handlers.GET(request("?emailId=email-1"));
  assert.equal(response.status, 401);
  assert.deepEqual(revoked, [sessionId]);

  const failing = makeHandlers({
    getEmailDetail: async () => {
      throw new JmapAccountMismatchError();
    },
    revokeSession: async () => {
      throw new Error("database details must stay private");
    },
  });
  const failedResponse = await failing.handlers.GET(request("?emailId=email-1"));
  assert.equal(failedResponse.status, 503);
  assert.deepEqual(await failedResponse.json(), { error: "mail_unavailable" });
});

test("maps a missing message to a generic 404", async () => {
  const { handlers } = makeHandlers({
    getEmailDetail: async () => {
      throw new JmapEmailNotFoundError();
    },
  });

  const response = await handlers.GET(request("?emailId=email-1"));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "message_not_found" });
});

test("rejects cross-origin read-state updates before loading a session", async () => {
  let sessionCount = 0;
  const { handlers } = makeHandlers({
    getSessionId: async () => {
      sessionCount += 1;
      return sessionId;
    },
    isTrustedOrigin: () => false,
  });

  const response = await handlers.POST(
    request("?emailId=email-1", "POST", "https://attacker.example"),
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "origin_not_allowed" });
  assert.equal(sessionCount, 0);
});

test("rejects a different localhost port and accepts the app's exact dev origin", async () => {
  let sessionCount = 0;
  let mutationCount = 0;
  const { handlers } = makeHandlers({
    getSessionId: async () => {
      sessionCount += 1;
      return sessionId;
    },
    isTrustedOrigin: (request) => isTrustedAppOrigin(request, false),
    markEmailRead: async () => {
      mutationCount += 1;
    },
  });

  const crossPortResponse = await handlers.POST(
    request(
      "?emailId=email-1",
      "POST",
      "http://localhost:3000",
      "http://localhost:3101",
    ),
  );
  assert.equal(crossPortResponse.status, 403);
  assert.deepEqual(await crossPortResponse.json(), {
    error: "origin_not_allowed",
  });
  assert.equal(sessionCount, 0);
  assert.equal(mutationCount, 0);

  const sameOriginResponse = await handlers.POST(
    request(
      "?emailId=email-1",
      "POST",
      "http://localhost:3101",
      "http://localhost:3101",
    ),
  );
  assert.equal(sameOriginResponse.status, 200);
  assert.equal(sessionCount, 1);
  assert.equal(mutationCount, 1);
});

test("marks read using the session account only after a trusted-origin request", async () => {
  let receivedOptions: unknown;
  const { handlers } = makeHandlers({
    markEmailRead: async (options) => {
      receivedOptions = options;
    },
  });

  const response = await handlers.POST(
    request("?emailId=email-1", "POST", "https://webmail.example.test"),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { isUnread: false });
  assert.deepEqual(receivedOptions, {
    accessToken,
    expectedAccountId: "account-1",
    emailId: "email-1",
    sessionUrl: "https://mail.example.test/.well-known/jmap",
    trustedOrigins: ["https://mail.example.test"],
    allowInsecureHttp: false,
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
});

test("maps session-store failures to a generic unavailable response", async () => {
  const { handlers } = makeHandlers({
    getAuthenticatedSession: async () => {
      throw new Error("database details must stay private");
    },
  });

  const response = await handlers.GET(request("?emailId=email-1"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "mail_unavailable" });
});
