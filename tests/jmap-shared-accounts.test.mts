import assert from "node:assert/strict";
import test from "node:test";

import {
  JmapAccountMismatchError,
  JmapSharedAccountReadOnlyError,
  JmapSharedAccountUnavailableError,
  runJmapOAuthMailAccounts,
  runJmapOAuthMailAction,
  runJmapOAuthMailboxListing,
  runJmapOAuthMarkEmailRead,
} from "../lib/jmap/client.mts";
import { createMailAccountsGetHandler } from "../lib/jmap/mail-accounts-route.mts";
import { mailAccountOption } from "../lib/jmap/mail-account-param.mts";

const CORE = "urn:ietf:params:jmap:core";
const MAIL = "urn:ietf:params:jmap:mail";
const ORIGIN = "https://mail.example.test";
const mailCapability = { accountCapabilities: { [MAIL]: {} } };

function createFetch(accounts: Record<string, unknown>, primary = "primary") {
  const apiAccountIds: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === "/.well-known/jmap") {
      return new Response(null, { status: 307, headers: { location: "/jmap/session" } });
    }
    if (url.pathname === "/jmap/session") {
      return Response.json({
        capabilities: { [CORE]: {}, [MAIL]: {} },
        accounts,
        primaryAccounts: { [MAIL]: primary },
        apiUrl: `${ORIGIN}/jmap/`,
        uploadUrl: `${ORIGIN}/jmap/upload/{accountId}/`,
        downloadUrl: `${ORIGIN}/jmap/download/{accountId}/{blobId}/{name}`,
      });
    }
    const request = JSON.parse(String(init.body));
    apiAccountIds.push(request.methodCalls[0][1].accountId);
    return Response.json({ methodResponses: [] });
  };
  return { fetchImpl: fetchImpl as typeof fetch, apiAccountIds };
}

const accounts = () => ({
  primary: { isPersonal: true, isReadOnly: false, ...mailCapability },
  group: { name: "core@rekad.id", isPersonal: false, isReadOnly: false, ...mailCapability },
  viewer: { name: "board@rekad.id", isPersonal: false, isReadOnly: true, ...mailCapability },
});
const base = { accessToken: "token", expectedAccountId: "primary", sessionUrl: `${ORIGIN}/.well-known/jmap`, trustedOrigins: [ORIGIN] };

test("lists the primary and group accounts from the live session", async () => {
  const { fetchImpl } = createFetch(accounts());
  const result = await runJmapOAuthMailAccounts({ ...base, fetchImpl });
  assert.deepEqual(result.map((account) => account.id), ["primary", "group", "viewer"]);
});

test("rejects a session whose primary account changed", async () => {
  const { fetchImpl } = createFetch(accounts(), "primary");
  await assert.rejects(
    runJmapOAuthMailAccounts({ ...base, expectedAccountId: "someone-else", fetchImpl }),
    JmapAccountMismatchError,
  );
});

test("sends JMAP calls for an advertised shared account only", async () => {
  const shared = createFetch(accounts());
  await runJmapOAuthMailboxListing({ ...base, mailAccountId: "group", fetchImpl: shared.fetchImpl }).catch(() => undefined);
  assert.equal(shared.apiAccountIds[0], "group");

  const own = createFetch(accounts());
  await runJmapOAuthMailboxListing({ ...base, fetchImpl: own.fetchImpl }).catch(() => undefined);
  assert.equal(own.apiAccountIds[0], "primary");
});

test("refuses unadvertised, personal and revoked accounts without calling the API", async () => {
  for (const mailAccountId of ["stranger", "", "personal"]) {
    const { fetchImpl, apiAccountIds } = createFetch({
      ...accounts(),
      personal: { isPersonal: true, isReadOnly: false, ...mailCapability },
    });
    await assert.rejects(
      runJmapOAuthMailboxListing({ ...base, mailAccountId, fetchImpl }),
      JmapSharedAccountUnavailableError,
    );
    assert.equal(apiAccountIds.length, 0);
  }
});

test("a shared account cannot be used with a mismatched session account", async () => {
  const { fetchImpl } = createFetch(accounts());
  await assert.rejects(
    runJmapOAuthMailboxListing({ ...base, expectedAccountId: "other", mailAccountId: "group", fetchImpl }),
    JmapAccountMismatchError,
  );
});

test("blocks changes to a read-only shared account before any API call", async () => {
  const marked = createFetch(accounts());
  await assert.rejects(
    runJmapOAuthMarkEmailRead({ ...base, mailAccountId: "viewer", emailId: "e1", fetchImpl: marked.fetchImpl }),
    JmapSharedAccountReadOnlyError,
  );
  assert.equal(marked.apiAccountIds.length, 0);
  const action = createFetch(accounts());
  await assert.rejects(
    runJmapOAuthMailAction({ ...base, mailAccountId: "viewer", input: { action: "star", emailId: "e1" }, fetchImpl: action.fetchImpl }),
    JmapSharedAccountReadOnlyError,
  );
  assert.equal(action.apiAccountIds.length, 0);
});

test("the accounts route returns only shared accounts and ends mismatched sessions", async () => {
  const revoked: string[] = [];
  const handler = createMailAccountsGetHandler({
    getSessionId: async () => "sid",
    getAuthenticatedSession: async () => ({ accessToken: "t", accountId: "primary" }),
    revokeSession: async (id) => void revoked.push(id),
    listAccounts: async () => [
      { id: "primary", name: "me", isPrimary: true, isReadOnly: false },
      { id: "group", name: "core@rekad.id", isPrimary: false, isReadOnly: true },
    ],
    getJmapSettings: () => ({ sessionUrl: `${ORIGIN}/.well-known/jmap`, trustedOrigins: [ORIGIN], allowInsecureHttp: false }),
  });
  const ok = await handler(new Request("https://webmail.rekad.id/api/mail/accounts"));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { sharedAccounts: [{ id: "group", name: "core@rekad.id", isReadOnly: true }] });

  const mismatch = createMailAccountsGetHandler({
    getSessionId: async () => "sid",
    getAuthenticatedSession: async () => ({ accessToken: "t", accountId: "primary" }),
    revokeSession: async (id) => void revoked.push(id),
    listAccounts: async () => { throw new JmapAccountMismatchError(); },
    getJmapSettings: () => ({ sessionUrl: `${ORIGIN}/.well-known/jmap`, trustedOrigins: [ORIGIN], allowInsecureHttp: false }),
  });
  assert.equal((await mismatch(new Request("https://webmail.rekad.id/api/mail/accounts"))).status, 401);
  assert.deepEqual(revoked, ["sid"]);
});

test("account query parameter parsing", () => {
  assert.deepEqual(mailAccountOption(new Request("https://x.test/api/mail")), {});
  assert.deepEqual(mailAccountOption(new Request("https://x.test/api/mail?accountId=g1")), { mailAccountId: "g1" });
  assert.deepEqual(mailAccountOption(new Request("https://x.test/api/mail?accountId=a&accountId=b")), { mailAccountId: "" });
});
