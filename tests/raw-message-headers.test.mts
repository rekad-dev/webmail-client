import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeHeaderValue,
  firstHeader,
  parseRawMessageHeaders,
} from "../lib/mail/raw-message-headers.mts";

test("parses and unfolds headers without reading the body", () => {
  const headers = parseRawMessageHeaders(
    "Subject: A long\r\n subject line\r\nFrom: a@example.test\r\nTo: b@example.test\r\n\r\nSubject: not a header",
  );
  assert.equal(firstHeader(headers, "subject"), "A long subject line");
  assert.equal(firstHeader(headers, "FROM"), "a@example.test");
  assert.equal(headers.length, 3);
  assert.equal(firstHeader(headers, "Cc"), null);
});

test("handles LF-only messages and header-only input", () => {
  assert.equal(firstHeader(parseRawMessageHeaders("Subject: Hi\n\nBody"), "Subject"), "Hi");
  assert.equal(firstHeader(parseRawMessageHeaders("Subject: Hi"), "Subject"), "Hi");
});

test("decodes RFC 2047 words and leaves malformed ones alone", () => {
  assert.equal(decodeHeaderValue("=?UTF-8?B?SGVsbG8g8J+RiyBXb3JsZA==?="), "Hello 👋 World");
  assert.equal(decodeHeaderValue("=?utf-8?Q?Caf=C3=A9_menu?="), "Café menu");
  assert.equal(
    decodeHeaderValue("=?UTF-8?B?SGVsbG8=?= =?UTF-8?B?IFdvcmxk?="),
    "Hello World",
  );
  assert.equal(decodeHeaderValue("=?unknown-charset?B?SGk=?="), "=?unknown-charset?B?SGk=?=");
});
