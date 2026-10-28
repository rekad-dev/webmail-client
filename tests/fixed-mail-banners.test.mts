import assert from "node:assert/strict";
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

const banners = getFixedMailBanners(new Date("2026-10-28T00:00:00Z"));

test("fixed banners use the public header image and the current year", () => {
  assert.equal(banners.version, FIXED_BANNER_VERSION);
  assert.match(banners.headerHtml, /src="https:\/\/webmail\.rekad\.id\/mail-header\.png"/);
  assert.match(banners.footerHtml, /Copyright &copy; 2026 rekad/);
  assert.match(banners.footerHtml, /href="https:\/\/www\.rekad\.id"/);
});

test("the header sits above the message and the footer below it", () => {
  const { htmlBody, body } = prepareManagedMessageContent({ body: "Hello **there**" }, banners);
  const header = htmlBody.indexOf("mail-header.png");
  const message = htmlBody.indexOf("Hello **there**");
  const footer = htmlBody.indexOf("Copyright");
  assert.ok(header >= 0 && header < message && message < footer);
  assert.equal(managedBannerVersion(htmlBody), FIXED_BANNER_VERSION);
  assert.match(body, /Hello \*\*there\*\*/);
  assert.match(body, /Copyright © 2026 rekad/);
  assert.doesNotMatch(body, /mail-header\.png|<img|rekad\]/);
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
  assert.match(rebuilt, /mail-header\.png/);
  assert.match(rebuilt, /<p>Body<\/p>/);
  assert.equal(stripManagedBannerHtml(rebuilt), "<p>Body</p>");
  assert.equal(composedHtmlToText("<p>Hi</p>"), "Hi");
});
