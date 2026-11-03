import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  composedHtmlToText,
  managedBannerVersion,
  prepareManagedMessageContent,
  sanitizeComposedHtml,
  sanitizeStoredManagedMessageHtml,
  stripManagedBannerHtml,
} from "../lib/mail/composed-content.mts";
import {
  FIXED_BANNER_VERSION,
  getFixedMailBanners,
} from "../lib/mail/fixed-mail-banners.mts";
import { FIXED_INLINE_IMAGES } from "../lib/mail/fixed-mail-images.mts";

const banners = getFixedMailBanners(new Date("2026-10-28T00:00:00Z"));

test("fixed banners embed their images by Content-ID and carry the current year", () => {
  assert.equal(banners.version, FIXED_BANNER_VERSION);
  assert.match(banners.headerHtml, /src="cid:rekad-header"/);
  assert.match(banners.footerHtml, /src="cid:rekad-instagram"/);
  assert.match(banners.footerHtml, /Copyright &copy; 2026 rekad/);
  assert.match(banners.footerHtml, /Apple Developer Academy @BINUS, Jl\. Grand Boulevard/);
  assert.match(banners.footerHtml, /Banten 15345/);
  assert.match(banners.footerHtml, /href="https:\/\/www\.rekad\.id"/);
  assert.match(banners.footerHtml, /href="https:\/\/www\.instagram\.com\/rekad\.id"/);
  assert.doesNotMatch(`${banners.headerHtml}${banners.footerHtml}`, /src="https?:/);
});

test("embedded image data matches the committed asset files", () => {
  const files: Record<string, string> = {
    "rekad-header": "mail-header.png",
    "rekad-instagram": "instagram.png",
  };
  assert.equal(FIXED_INLINE_IMAGES.length, 2);
  for (const image of FIXED_INLINE_IMAGES) {
    const file = readFileSync(new URL(`../lib/mail/assets/${files[image.cid]}`, import.meta.url));
    assert.equal(image.base64, file.toString("base64"), image.cid);
    assert.deepEqual([...file.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  }
});

test("the header sits above the message and the footer below it", () => {
  const { htmlBody, body } = prepareManagedMessageContent({ body: "Hello **there**" }, banners);
  const header = htmlBody.indexOf("cid:rekad-header");
  const message = htmlBody.indexOf("Hello **there**");
  const footer = htmlBody.indexOf("Copyright");
  assert.ok(header >= 0 && header < message && message < footer);
  assert.equal(managedBannerVersion(htmlBody), FIXED_BANNER_VERSION);
  assert.match(body, /Hello \*\*there\*\*/);
  assert.match(body, /Copyright © 2026 rekad/);
  assert.match(body, /Apple Developer Academy @BINUS/);
  assert.doesNotMatch(body, /cid:|<img|rekad\]|Instagram\]/);
});

test("user markup cannot add images or styles around the banners", () => {
  const { htmlBody } = prepareManagedMessageContent(
    { body: "x", htmlBody: '<p style="color:red">Hi</p><img src="https://tracker.example/p.png">' },
    banners,
  );
  assert.doesNotMatch(htmlBody, /tracker\.example|color:red/);
});

test("stored banner sections are replaced by the fixed markup", () => {
  const forged =
    "<!--rekad-banner-version:1--><!--rekad-banner-header-start--><img src=\"https://evil.example/x.png\">" +
    "<!--/rekad-banner-header--><p>Body</p>" +
    "<!--rekad-banner-footer-start--><a href=\"https://evil.example\">pay</a><!--/rekad-banner-footer-->";
  const rebuilt = sanitizeStoredManagedMessageHtml(forged);
  assert.doesNotMatch(rebuilt, /evil\.example/);
  assert.match(rebuilt, /cid:rekad-header/);
  assert.match(rebuilt, /<p>Body<\/p>/);
  assert.equal(stripManagedBannerHtml(rebuilt), "<p>Body</p>");
  assert.equal(composedHtmlToText("<p>Hi</p>"), "Hi");
});


test("unmarked quotations stay inside the branded message before the footer", () => {
  const { htmlBody } = prepareManagedMessageContent({
    body: "",
    htmlBody: "<p>New reply</p><p>On Monday, Sender wrote:</p><blockquote><p>Previous reply</p><blockquote><p>Earlier message</p></blockquote></blockquote>",
  }, banners);
  assert.match(htmlBody, /<table role="presentation" align="center" width="600"/);
  const frame = htmlBody.indexOf('<table role="presentation"');
  const reply = htmlBody.indexOf("New reply");
  const history = htmlBody.indexOf("Earlier message");
  const footer = htmlBody.indexOf("Copyright");
  const end = htmlBody.indexOf("</table>");
  assert.ok(frame < reply && reply < history && history < footer && footer < end);
  assert.match(htmlBody, /<blockquote style="[^"]*border-left:3px solid #b4b4bd;[^"]*"><p>Previous reply<\/p><blockquote style="[^"]*border-left:3px solid #b4b4bd;[^"]*"><p>Earlier message<\/p><\/blockquote><\/blockquote>/);
  assert.equal(stripManagedBannerHtml(htmlBody), "<p>New reply</p><p>On Monday, Sender wrote:</p><blockquote><p>Previous reply</p><blockquote><p>Earlier message</p></blockquote></blockquote>");
});

test("reply attribution and nested history follow the footer and closed branded frame", () => {
  const userHtml = '<p>New reply</p><blockquote data-rekad-reply-history="true"><p>On Monday, Sender wrote:</p><p>Previous reply</p><blockquote><p>Earlier message</p></blockquote></blockquote>';
  const { htmlBody, body } = prepareManagedMessageContent({ body: "", htmlBody: userHtml }, banners);
  assert.ok(htmlBody.indexOf("New reply") < htmlBody.indexOf("Copyright"));
  assert.ok(htmlBody.indexOf("Copyright") < htmlBody.indexOf("</table>"));
  assert.ok(htmlBody.indexOf("</table>") < htmlBody.indexOf("On Monday"));
  assert.ok(htmlBody.indexOf("On Monday") < htmlBody.indexOf("Earlier message"));
  assert.ok(body.indexOf("New reply") < body.indexOf("Copyright"));
  assert.ok(body.indexOf("Copyright") < body.indexOf("On Monday"));
  assert.equal(stripManagedBannerHtml(htmlBody), userHtml);
  const rebuilt = sanitizeStoredManagedMessageHtml(htmlBody);
  assert.equal(stripManagedBannerHtml(rebuilt), userHtml);
  assert.equal((rebuilt.match(/Copyright/g) ?? []).length, 1);
  assert.ok(rebuilt.indexOf("Copyright") < rebuilt.indexOf("On Monday"));
});

test("a nested reply marker cannot split the surrounding authored quote or break the frame", () => {
  const html = '<p>New text</p><blockquote><p>Authored quote</p><blockquote data-rekad-reply-history="true"><p>Nested history</p></blockquote></blockquote>';
  const { htmlBody } = prepareManagedMessageContent({ body: "", htmlBody: html }, banners);
  assert.ok(htmlBody.indexOf("Nested history") < htmlBody.indexOf("Copyright"));
  assert.equal(stripManagedBannerHtml(htmlBody), html);
});

test("invalid reply markers cannot move text outside the frame or retain arbitrary attributes", () => {
  const userHtml = sanitizeComposedHtml('<blockquote data-rekad-reply-history="false" onclick="bad()"><p>Text</p></blockquote>');
  assert.doesNotMatch(userHtml, /onclick|="true"/);
  const { htmlBody } = prepareManagedMessageContent({ body: "", htmlBody: userHtml }, banners);
  assert.ok(htmlBody.indexOf("Text") < htmlBody.indexOf("Copyright"));
  assert.equal(sanitizeComposedHtml('<p data-rekad-reply-history="true">Text</p>'), '<p>Text</p>');
});
