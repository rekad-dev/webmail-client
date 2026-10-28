import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  composedHtmlToText,
  managedBannerVersion,
  prepareManagedMessageContent,
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
