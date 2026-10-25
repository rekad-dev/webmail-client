import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  JmapAccountMismatchError,
  runJmapOAuthInboxChanges,
} from "../lib/jmap/client.mts";

const CORE = "urn:ietf:params:jmap:core";
const MAIL = "urn:ietf:params:jmap:mail";
const ORIGIN = "https://mail.example.test";
const accessToken = randomBytes(32).toString("base64url");

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

function makeFetch(options: {
  accountId?: string;
  changes?: unknown;
  memberships?: Record<string, string[]>;
} = {}) {
  const requests: Array<Record<string, unknown>> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === "/.well-known/jmap") return Response.json(session(options.accountId));
    const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requests.push(request);
    const [method, args, callId] = (request.methodCalls as unknown[][])[0] as [string, Record<string, unknown>, string];
    if (method === "Email/changes") {
      const changes = options.changes ?? {
        accountId: "account-1",
        oldState: "state-1",
        newState: "state-2",
        hasMoreChanges: false,
        created: ["new-inbox"],
        updated: ["updated-outside"],
        destroyed: ["deleted"],
      };
      if (
        changes && typeof changes === "object" &&
        (changes as Record<string, unknown>).type === "cannotCalculateChanges"
      ) {
        return Response.json({ methodResponses: [["error", changes, callId]] });
      }
      return Response.json({ methodResponses: [[
        "Email/changes",
        changes,
        callId,
      ]] });
    }
    if (method === "Mailbox/get") {
      return Response.json({ methodResponses: [[
        "Mailbox/get",
        { state: "mailbox-state", list: [{ id: "inbox-id", name: "Inbox", role: "inbox" }] },
        callId,
      ]] });
    }
    if (method === "Email/get") {
      const ids = args.ids as string[];
      if (ids.length === 0) {
        return Response.json({ methodResponses: [[
          "Email/get",
          { accountId: "account-1", state: "baseline-state", list: [], notFound: [] },
          callId,
        ]] });
      }
      const list = ids.map((id) => ({
        id,
        mailboxIds: (options.memberships?.[id] ?? (id === "new-inbox" ? ["inbox-id"] : []))
          .reduce<Record<string, boolean>>((result, mailboxId) => ({ ...result, [mailboxId]: true }), {}),
      }));
      return Response.json({ methodResponses: [[
        "Email/get",
        { accountId: "account-1", state: "metadata-state", list, notFound: [] },
        callId,
      ]] });
    }
    throw new Error(`Unexpected JMAP method ${method}`);
  };
  return { fetchImpl, requests };
}

const common = {
  accessToken,
  expectedAccountId: "account-1",
  sessionUrl: `${ORIGIN}/.well-known/jmap`,
};

test("establishes a no-notification baseline for historical mail", async () => {
  const { fetchImpl, requests } = makeFetch();
  const result = await runJmapOAuthInboxChanges({ ...common, sinceState: null, fetchImpl });
  assert.deepEqual(result, {
    emailState: "baseline-state",
    newInboxEmailIds: [],
    hasMore: false,
    hasInboxChanges: false,
    reset: true,
  });
  assert.equal(requests.length, 1);
  const [method, args] = (requests[0]?.methodCalls as unknown[][])[0] as [string, Record<string, unknown>];
  assert.equal(method, "Email/get");
  assert.deepEqual(args.ids, []);
});

test("classifies only newly created Inbox membership without requesting message content", async () => {
  const { fetchImpl, requests } = makeFetch();
  const result = await runJmapOAuthInboxChanges({ ...common, sinceState: "state-1", fetchImpl });
  assert.deepEqual(result, {
    emailState: "state-2",
    newInboxEmailIds: ["new-inbox"],
    hasMore: false,
    hasInboxChanges: true,
    reset: false,
  });
  const emailGet = requests.find((request) => {
    const call = (request.methodCalls as unknown[][])[0];
    return call?.[0] === "Email/get";
  });
  assert.ok(emailGet);
  const [method, args] = (emailGet.methodCalls as unknown[][])[0] as [string, Record<string, unknown>];
  assert.equal(method, "Email/get");
  assert.deepEqual(args.properties, ["id", "mailboxIds"]);
  assert.equal("bodyProperties" in args, false);
  assert.equal("fetchTextBodyValues" in args, false);
  assert.deepEqual(args.ids, ["new-inbox", "updated-outside"]);
});

test("re-baselines when JMAP cannot calculate an old cursor", async () => {
  const { fetchImpl } = makeFetch({
    changes: { type: "cannotCalculateChanges" },
  });
  const result = await runJmapOAuthInboxChanges({ ...common, sinceState: "old-state", fetchImpl });
  assert.equal(result.emailState, "baseline-state");
  assert.deepEqual(result.newInboxEmailIds, []);
  assert.equal(result.reset, true);
});

test("rejects a JMAP account that differs from the authenticated app account", async () => {
  const { fetchImpl } = makeFetch({ accountId: "account-2" });
  await assert.rejects(
    runJmapOAuthInboxChanges({ ...common, sinceState: null, fetchImpl }),
    JmapAccountMismatchError,
  );
});
