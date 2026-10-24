import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeEmailHtml } from "../lib/mail/sanitize-email-html.mts";

test("removes executable markup, remote resources, styles, and inline handlers", () => {
  const result = sanitizeEmailHtml(
    '<div onclick="run()" style="background:url(https://tracker.example/pixel)">' +
      '<strong>Hello</strong><img src="https://tracker.example/pixel" onerror="run()">' +
      '<script>run()</script><style>@import url(https://tracker.example/style.css)</style>' +
      '<iframe src="https://attacker.example"></iframe></div>',
  );

  assert.match(result.html, /<strong>Hello<\/strong>/);
  assert.doesNotMatch(result.html, /<script|<style|<iframe|<img|onclick|onerror|url\(/i);
  assert.deepEqual(result.externalLinks, []);
});

test("makes body links inert and returns only safe external destinations", () => {
  const result = sanitizeEmailHtml(
    '<p><a href="https://example.test/path?q=1">Open</a>' +
      '<a href="mailto:help@example.test">Contact</a>' +
      '<a href="javascript:alert(1)">Unsafe</a>' +
      '<a href="//tracker.example/path">Protocol relative</a>' +
      '<a href="https://user:secret@example.test/">Credentials</a></p>',
  );

  assert.match(result.html, /<span>Open<\/span>/);
  assert.match(result.html, /<span>Contact<\/span>/);
  assert.match(result.html, /<span>Unsafe<\/span>/);
  assert.doesNotMatch(result.html, /<a\b|href=/i);
  assert.deepEqual(result.externalLinks, [
    "https://example.test/path?q=1",
    "mailto:help@example.test",
  ]);
});

test("keeps only a bounded number of distinct destinations", () => {
  const links = Array.from(
    { length: 60 },
    (_, index) => `<a href="https://example.test/${index}">link</a>`,
  ).join("");
  const result = sanitizeEmailHtml(links);

  assert.equal(result.externalLinks.length, 50);
});
