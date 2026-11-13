import assert from "node:assert/strict";
import test from "node:test";

import {
  createJmapSseParser,
  expandJmapEventSourceUrl,
  parseJmapStateChangeEvent,
  type JmapSseEvent,
} from "../lib/jmap/event-source.mts";

const TRUSTED = new Set(["https://mail.example.test"]);

test("expands simple RFC 8620 eventSourceUrl query placeholders", () => {
  const expanded = expandJmapEventSourceUrl(
    new URL("https://mail.example.test/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}"),
    TRUSTED,
    false,
  );
  assert.equal(
    expanded.toString(),
    "https://mail.example.test/jmap/eventsource/?types=Email%2CMailbox&closeafter=no&ping=25",
  );
});

test("expands RFC 6570 query expressions and plain URLs", () => {
  const rfc6570 = expandJmapEventSourceUrl(
    new URL("https://mail.example.test/jmap/eventsource/{?types,closeafter,ping}"),
    TRUSTED,
    false,
  );
  assert.equal(
    rfc6570.toString(),
    "https://mail.example.test/jmap/eventsource/?types=Email%2CMailbox&closeafter=no&ping=25",
  );

  const plain = expandJmapEventSourceUrl(
    new URL("https://mail.example.test/jmap/eventsource/"),
    TRUSTED,
    false,
  );
  assert.equal(
    plain.toString(),
    "https://mail.example.test/jmap/eventsource/?types=Email%2CMailbox&closeafter=no&ping=25",
  );
});

test("rejects untrusted origins, credentials, insecure http, and unknown templates", () => {
  assert.throws(() =>
    expandJmapEventSourceUrl(
      new URL("https://evil.example.test/jmap/eventsource/"),
      TRUSTED,
      false,
    ),
  );
  assert.throws(() =>
    expandJmapEventSourceUrl(
      new URL("http://mail.example.test/jmap/eventsource/"),
      new Set(["http://mail.example.test"]),
      false,
    ),
  );
  assert.throws(() =>
    expandJmapEventSourceUrl(
      new URL("https://mail.example.test/jmap/eventsource/?extra={unknown}"),
      TRUSTED,
      false,
    ),
  );
});

test("parses incremental SSE frames across split chunks, CRLF, comments, and multi-line data", () => {
  const events: JmapSseEvent[] = [];
  const parser = createJmapSseParser((event) => events.push(event));

  parser.push(": keepalive\r\n");
  parser.push("event: state\r\nid: 7\r\n");
  parser.push('data: {"@type":"StateChange",\r\n');
  parser.push('data: "changed":{"account-1":{"Email":"e2"}}}\r\n\r\n');
  parser.push("event: ping\ndata: {}\n\n");
  parser.flush();

  assert.deepEqual(events, [
    {
      event: "state",
      id: "7",
      data: '{"@type":"StateChange",\n"changed":{"account-1":{"Email":"e2"}}}',
    },
    {
      event: "ping",
      id: "7",
      data: "{}",
    },
  ]);
});

test("extracts state changes only for the authenticated account", () => {
  const match = parseJmapStateChangeEvent(
    "state",
    JSON.stringify({
      "@type": "StateChange",
      changed: {
        "account-1": { Email: "e2", Mailbox: "m2" },
        "account-2": { Email: "e9" },
      },
    }),
    "account-1",
  );
  assert.deepEqual(match, { emailState: "e2", mailboxState: "m2" });

  assert.equal(
    parseJmapStateChangeEvent(
      "state",
      JSON.stringify({
        "@type": "StateChange",
        changed: { "account-2": { Email: "e9" } },
      }),
      "account-1",
    ),
    null,
  );

  assert.equal(parseJmapStateChangeEvent("ping", "{}", "account-1"), null);
  assert.equal(parseJmapStateChangeEvent("state", "not-json", "account-1"), null);
});
