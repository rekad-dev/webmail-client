import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  JmapAccountMismatchError,
  JmapPocError,
  runJmapOAuthOfflineSync,
} from "../lib/jmap/client.mts";

const CORE = "urn:ietf:params:jmap:core";
const MAIL = "urn:ietf:params:jmap:mail";
const ORIGIN = "https://mail.example.test";
const token = randomBytes(32).toString("base64url");

function session(accountId = "account-1") {
  return {
    capabilities: { [CORE]: { maxObjectsInGet: 2 }, [MAIL]: {} },
    accounts: { [accountId]: { accountCapabilities: { [MAIL]: {} } } },
    primaryAccounts: { [MAIL]: accountId },
    apiUrl: `${ORIGIN}/jmap/`,
    uploadUrl: `${ORIGIN}/jmap/upload/{accountId}/`,
    downloadUrl: `${ORIGIN}/jmap/download/{accountId}/{blobId}/{name}/{type}`,
  };
}

function email(id: string, subject: string) {
  return {
    id,
    from: [{ name: "Sender", email: "sender@example.test" }],
    subject,
    receivedAt: "2026-10-24T10:00:00Z",
    keywords: { "$seen": true },
    textBody: [{ partId: "text-1", type: "text/plain" }],
    bodyValues: { "text-1": { value: `Body for ${id}` } },
  };
}

function makeFetch(options: {
  accountId?: string;
  changes?: unknown;
  emailGets?: Array<{ list: unknown[]; notFound: string[] }>;
} = {}) {
  const requests: Array<Record<string, unknown>> = [];
  const paths: string[] = [];
  let emailGetIndex = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    paths.push(url.pathname);
    if (url.pathname === "/.well-known/jmap") {
      return Response.json(session(options.accountId));
    }
    if (url.pathname !== "/jmap/") throw new Error("Unexpected JMAP target");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${token}`);
    const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requests.push(request);
    const calls = request.methodCalls as unknown[][];
    const [method, args, callId] = calls[0] as [string, Record<string, unknown>, string];
    assert.equal(args.accountId, "account-1");

    if (method === "Email/changes") {
      return Response.json({ methodResponses: [[
        "Email/changes",
        options.changes ?? {
          accountId: "account-1",
          oldState: "state-1",
          newState: "state-2",
          hasMoreChanges: false,
          created: [],
          updated: ["email-1"],
          destroyed: [],
        },
        callId,
      ]] });
    }
    if (method === "Email/get") {
      const ids = args.ids as string[];
      if (ids.length === 0) {
        return Response.json({ methodResponses: [[
          "Email/get",
          { accountId: "account-1", state: "state-reset", list: [], notFound: [] },
          callId,
        ]] });
      }
      const result = options.emailGets?.[emailGetIndex++] ?? {
        list: ids.map((id) => email(id, `Updated ${id}`)),
        notFound: [],
      };
      return Response.json({ methodResponses: [[
        "Email/get",
        {
          accountId: "account-1",
          state: "state-get",
          ...result,
        },
        callId,
      ]] });
    }
    throw new Error(`Unexpected JMAP method ${method}`);
  };
  return { fetchImpl, requests, paths };
}

const common = {
  accessToken: token,
  expectedAccountId: "account-1",
  sinceState: "state-1",
  emailIds: ["email-1"],
  sessionUrl: `${ORIGIN}/.well-known/jmap`,
};

test("uses Email/changes and fetches only changed cached message details", async () => {
  const { fetchImpl, requests } = makeFetch();
  const result = await runJmapOAuthOfflineSync({ ...common, fetchImpl });

  assert.equal(result.emailState, "state-2");
  assert.equal(result.hasMore, false);
  assert.equal(result.reset, false);
  assert.deepEqual(result.destroyed, []);
  assert.equal(result.updated[0]?.id, "email-1");
  assert.equal(result.updated[0]?.subject, "Updated email-1");
  assert.equal(result.updated[0]?.textBody, "Body for email-1");
  const firstCalls = requests[0]?.methodCalls as unknown[][];
  assert.deepEqual(firstCalls[0], [
    "Email/changes",
    {
      accountId: "account-1",
      sinceState: "state-1",
      maxChanges: 100,
    },
    "phase7-offline-email-changes",
  ]);
  const getArgs = ((requests[1]?.methodCalls as unknown[][])[0]?.[1] as Record<string, unknown>);
  assert.deepEqual(getArgs.ids, ["email-1"]);
  assert.deepEqual(getArgs.properties, [
    "id",
    "from",
    "subject",
    "sentAt",
    "receivedAt",
    "keywords",
    "textBody",
    "htmlBody",
    "bodyValues",
  ]);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("returns only saved IDs reported destroyed or missing during detail re-read", async () => {
  const response = makeFetch({
    changes: {
      accountId: "account-1",
      oldState: "state-1",
      newState: "state-2",
      hasMoreChanges: false,
      created: [],
      updated: ["email-1"],
      destroyed: [],
    },
    emailGets: [{ list: [], notFound: ["email-1"] }],
  });
  const result = await runJmapOAuthOfflineSync({
    ...common,
    fetchImpl: response.fetchImpl,
  });
  assert.deepEqual(result.updated, []);
  assert.deepEqual(result.destroyed, ["email-1"]);
});

test("rebuilds a bounded saved-ID set when JMAP cannot calculate changes", async () => {
  // Replace the JMAP transport with one that returns the method-level error,
  // then a current state token and one bounded saved message.
  const calls: Array<Record<string, unknown>> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === "/.well-known/jmap") return Response.json(session());
    const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push(request);
    const [method, args, callId] = (request.methodCalls as unknown[][])[0] as [string, Record<string, unknown>, string];
    if (method === "Email/changes") {
      return Response.json({ methodResponses: [["error", { type: "cannotCalculateChanges" }, callId]] });
    }
    if (method === "Email/get" && (args.ids as string[]).length === 0) {
      return Response.json({ methodResponses: [["Email/get", {
        accountId: "account-1", state: "state-reset", list: [], notFound: [],
      }, callId]] });
    }
    if (method === "Email/get") {
      return Response.json({ methodResponses: [["Email/get", {
        accountId: "account-1", state: "state-after-reset",
        list: [email("email-1", "Current subject")], notFound: [],
      }, callId]] });
    }
    throw new Error("Unexpected JMAP method");
  };
  const result = await runJmapOAuthOfflineSync({ ...common, fetchImpl });
  assert.equal(result.reset, true);
  assert.equal(result.emailState, "state-reset");
  assert.equal(result.updated[0]?.subject, "Current subject");
  assert.equal(calls.length, 3);
});

test("rejects mismatched JMAP account and inconsistent old-state coverage", async () => {
  const mismatch = makeFetch({ accountId: "account-2" });
  await assert.rejects(
    runJmapOAuthOfflineSync({ ...common, fetchImpl: mismatch.fetchImpl }),
    JmapAccountMismatchError,
  );

  const staleState = makeFetch({
    changes: {
      accountId: "account-1",
      oldState: "different-state",
      newState: "state-2",
      hasMoreChanges: false,
      created: [],
      updated: [],
      destroyed: [],
    },
  });
  await assert.rejects(
    runJmapOAuthOfflineSync({ ...common, fetchImpl: staleState.fetchImpl }),
    JmapPocError,
  );
});
