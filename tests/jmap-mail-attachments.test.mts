import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  JmapAccountMismatchError,
  JmapAttachmentTooLargeError,
  JmapEmailNotFoundError,
  JmapPocError,
  runJmapOAuthDownloadAttachment,
  runJmapOAuthUploadAttachment,
} from "../lib/jmap/client.mts";
import { MAX_MAIL_ATTACHMENT_BYTES } from "../lib/jmap/mail-attachment-request.mts";

const CORE = "urn:ietf:params:jmap:core";
const MAIL = "urn:ietf:params:jmap:mail";
const ORIGIN = "https://mail.example.test";
const accessToken = randomBytes(32).toString("base64url");
const bytes = new Uint8Array([0, 1, 2, 255]);

function session(accountId = "account-1"): Record<string, unknown> {
  return {
    capabilities: { [CORE]: {}, [MAIL]: {} },
    accounts: { [accountId]: { accountCapabilities: { [MAIL]: {} } } },
    primaryAccounts: { [MAIL]: accountId },
    apiUrl: `${ORIGIN}/jmap/`,
    uploadUrl: `${ORIGIN}/jmap/upload/{accountId}/`,
    downloadUrl: `${ORIGIN}/jmap/download/{accountId}/{blobId}/{name}/{type}`,
  };
}

function responseJson(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function downloadEmailResponse(overrides: Record<string, unknown> = {}) {
  return {
    accountId: "account-1",
    state: "state-1",
    list: [{
      id: "email-1",
      attachments: [{
        blobId: "blob-1",
        name: "report.pdf",
        type: "application/pdf",
        size: bytes.byteLength,
      }],
    }],
    notFound: [],
    ...overrides,
  };
}

function createJmapFetch(options: {
  accountId?: string;
  emailResponse?: Record<string, unknown>;
  uploadResponse?: unknown;
  binaryResponse?: Response;
  rejectUpload?: boolean;
} = {}) {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push({ url, init });
    if (url.pathname === "/.well-known/jmap") {
      return responseJson(session(options.accountId));
    }
    if (url.pathname === "/jmap/upload/account-1/") {
      if (options.rejectUpload) return new Response("no", { status: 403 });
      assert.equal(init.method, "POST");
      assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${accessToken}`);
      assert.equal(new Headers(init.headers).get("content-type"), "application/octet-stream");
      assert.deepEqual(new Uint8Array(init.body as ArrayBuffer), bytes);
      return responseJson(options.uploadResponse ?? {
        accountId: "account-1",
        blobId: "blob-1",
        type: "application/octet-stream",
        size: bytes.byteLength,
      });
    }
    if (url.pathname === "/jmap/") {
      const request = JSON.parse(String(init.body)) as {
        methodCalls: unknown[][];
      };
      const [method, args, callId] = request.methodCalls[0] as [string, Record<string, unknown>, string];
      assert.equal(method, "Email/get");
      return responseJson({
        methodResponses: [[
          "Email/get",
          options.emailResponse ?? downloadEmailResponse(),
          callId,
        ]],
      });
    }
    if (url.pathname.startsWith("/jmap/download/account-1/blob-1/")) {
      assert.equal(init.method, "GET");
      assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${accessToken}`);
      assert.equal(new Headers(init.headers).get("accept"), "application/octet-stream");
      assert.equal(init.redirect, "manual");
      return options.binaryResponse ?? new Response(bytes, {
        headers: { "content-type": "application/pdf" },
      });
    }
    throw new Error(`Unexpected JMAP request: ${url.href}`);
  };
  return { fetchImpl, calls };
}

const common = {
  accessToken,
  expectedAccountId: "account-1",
  sessionUrl: `${ORIGIN}/.well-known/jmap`,
};

test("uploads raw bytes to the trusted account URL and returns only blob metadata", async () => {
  const { fetchImpl, calls } = createJmapFetch();
  const result = await runJmapOAuthUploadAttachment({
    ...common,
    bytes,
    type: "application/octet-stream",
    fetchImpl,
  });

  assert.deepEqual(result, {
    blobId: "blob-1",
    type: "application/octet-stream",
    size: bytes.byteLength,
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.url.origin, ORIGIN);
});

test("rejects an unexpected primary account before upload", async () => {
  const { fetchImpl, calls } = createJmapFetch({ accountId: "account-2" });
  await assert.rejects(
    runJmapOAuthUploadAttachment({
      ...common,
      bytes,
      type: "application/octet-stream",
      fetchImpl,
    }),
    JmapAccountMismatchError,
  );
  assert.equal(calls.length, 1);
});

test("rejects uploads beyond the configured per-file limit", async () => {
  const { fetchImpl, calls } = createJmapFetch();
  await assert.rejects(
    runJmapOAuthUploadAttachment({
      ...common,
      bytes: new Uint8Array(MAX_MAIL_ATTACHMENT_BYTES + 1),
      type: "application/octet-stream",
      fetchImpl,
    }),
    JmapAttachmentTooLargeError,
  );
  assert.equal(calls.length, 0);
});

test("re-reads owning email metadata before downloading a bounded opaque blob", async () => {
  const { fetchImpl, calls } = createJmapFetch();
  const result = await runJmapOAuthDownloadAttachment({
    ...common,
    emailId: "email-1",
    attachmentIndex: 0,
    fetchImpl,
  });

  assert.deepEqual(result, {
    bytes,
    name: "report.pdf",
    size: bytes.byteLength,
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[2]?.url.pathname, "/jmap/download/account-1/blob-1/report.pdf/application%2Fpdf");
  const apiRequest = JSON.parse(String(calls[1]?.init.body)) as {
    methodCalls: unknown[][];
  };
  const [method, args] = apiRequest.methodCalls[0] as [string, Record<string, unknown>];
  assert.equal(method, "Email/get");
  assert.equal(args.accountId, "account-1");
  assert.deepEqual(args.ids, ["email-1"]);
  assert.deepEqual(args.properties, ["id", "attachments"]);
  assert.deepEqual(args.bodyProperties, ["blobId", "name", "type", "size", "disposition"]);
});

test("uses a safe fallback filename when the JMAP attachment has no name", async () => {
  const { fetchImpl, calls } = createJmapFetch({
    emailResponse: downloadEmailResponse({
      list: [{
        id: "email-1",
        attachments: [{
          blobId: "blob-1",
          name: null,
          type: "application/pdf",
          size: bytes.byteLength,
        }],
      }],
    }),
  });
  const result = await runJmapOAuthDownloadAttachment({
    ...common,
    emailId: "email-1",
    attachmentIndex: 0,
    fetchImpl,
  });
  assert.equal(result.name, "attachment");
  assert.equal(calls[2]?.url.pathname, "/jmap/download/account-1/blob-1/attachment/application%2Fpdf");
});

test("returns not found only for a consistent JMAP notFound response", async () => {
  const missing = createJmapFetch({
    emailResponse: {
      accountId: "account-1",
      state: "state-1",
      list: [],
      notFound: ["email-1"],
    },
  });
  await assert.rejects(
    runJmapOAuthDownloadAttachment({
      ...common,
      emailId: "email-1",
      attachmentIndex: 0,
      fetchImpl: missing.fetchImpl,
    }),
    JmapEmailNotFoundError,
  );
  assert.equal(missing.calls.length, 2);

  const inconsistent = createJmapFetch({
    emailResponse: {
      ...downloadEmailResponse(),
      notFound: ["another-email"],
    },
  });
  await assert.rejects(
    runJmapOAuthDownloadAttachment({
      ...common,
      emailId: "email-1",
      attachmentIndex: 0,
      fetchImpl: inconsistent.fetchImpl,
    }),
    JmapPocError,
  );
  assert.equal(inconsistent.calls.length, 2);
});

test("rejects redirects from the JMAP download endpoint", async () => {
  const { fetchImpl } = createJmapFetch({
    binaryResponse: new Response(null, {
      status: 302,
      headers: { location: "https://attacker.example/collect" },
    }),
  });
  await assert.rejects(
    runJmapOAuthDownloadAttachment({
      ...common,
      emailId: "email-1",
      attachmentIndex: 0,
      fetchImpl,
    }),
    /redirected unexpectedly/,
  );
});
