import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  MAX_MAIL_SEND_REQUEST_BYTES,
  InvalidMailSendRequest,
  OversizedMailSendRequest,
  parseMailSendRequest,
} from "../lib/jmap/mail-send-request.mts";

const attemptKey = randomBytes(32).toString("base64url");

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://webmail.example.test/api/mail/send", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    attemptKey,
    identityId: "identity-1",
    to: ["to@example.test"],
    cc: [],
    bcc: [],
    subject: "A subject",
    body: "Plain text body",
    ...overrides,
  };
}

test("parses a bounded plain-text message and address lists", async () => {
  assert.deepEqual(await parseMailSendRequest(request(validBody())), {
    attemptKey,
    identityId: "identity-1",
    to: [{ name: null, email: "to@example.test" }],
    cc: [],
    bcc: [],
    subject: "A subject",
    body: "Plain text body",
    attachments: [],
  });
});

test("accepts a concrete From address only as explicit wildcard identity input", async () => {
  const parsed = await parseMailSendRequest(
    request(validBody({ fromEmail: "alias@example.test" })),
  );
  assert.equal(parsed.fromEmail, "alias@example.test");
});

test("rejects extra fields that could override account, envelope, or message structure", async () => {
  for (const field of ["accountId", "envelope", "from", "htmlBody", "bodyStructure"]) {
    await assert.rejects(
      parseMailSendRequest(request(validBody({ [field]: "untrusted" }))),
      InvalidMailSendRequest,
    );
  }
});

test("rejects malformed, duplicated, and excessive recipients", async () => {
  for (const body of [
    validBody({ to: ["invalid address"] }),
    validBody({ to: ["same@example.test"], cc: ["SAME@example.test"] }),
    validBody({ to: Array.from({ length: 51 }, (_, index) => `u${index}@example.test`) }),
  ]) {
    await assert.rejects(
      parseMailSendRequest(request(body)),
      InvalidMailSendRequest,
    );
  }
});

test("maps attachment count and aggregate size limits to the oversized request error", async () => {
  const files = Array.from({ length: 6 }, (_, index) => ({
    blobId: `blob-${index}`,
    name: `file-${index}.bin`,
    type: "application/octet-stream",
    size: 4 * 1024 * 1024,
  }));
  await assert.rejects(
    parseMailSendRequest(request(validBody({ attachments: files }))),
    OversizedMailSendRequest,
  );
});

test("rejects oversized subjects, bodies, keys, controls, and malformed JSON", async () => {
  for (const body of [
    validBody({ subject: "s".repeat(999) }),
    validBody({ body: "b".repeat(256 * 1024 + 1) }),
    validBody({ attemptKey: "short" }),
    validBody({ subject: "subject\r\ninjected" }),
  ]) {
    await assert.rejects(
      parseMailSendRequest(request(body)),
      InvalidMailSendRequest,
    );
  }
  await assert.rejects(
    parseMailSendRequest(request("{")),
    InvalidMailSendRequest,
  );

  await assert.rejects(
    parseMailSendRequest(
      request(validBody(), {
        "content-length": String(MAX_MAIL_SEND_REQUEST_BYTES + 1),
      }),
    ),
    OversizedMailSendRequest,
  );
});
