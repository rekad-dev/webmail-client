import { convert } from "html-to-text";
import sanitizeHtml from "sanitize-html";

import { getFixedMailBanners } from "./fixed-mail-banners.mts";
import { buildManagedMessageHtml, type ManagedMailBanners } from "./message-layout.mts";
export { buildManagedMessageHtml, type ManagedMailBanners } from "./message-layout.mts";

export const MAX_COMPOSED_HTML_BYTES = 256 * 1024;

const COMPOSE_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "strong",
  "u",
  "ul",
] as const;

function sanitizeHtmlValue(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: [...COMPOSE_TAGS],
    allowedAttributes: {
      a: ["href"],
      blockquote: [{ name: "data-rekad-reply-history", values: ["true"] }],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { a: ["http", "https", "mailto"] },
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    nestingLimit: 40,
    parseStyleAttributes: false,
  }).trim();
}

export function sanitizeComposedHtml(value: string): string {
  if (Buffer.byteLength(value, "utf8") > MAX_COMPOSED_HTML_BYTES) {
    throw new RangeError("The formatted message is too large.");
  }
  const html = sanitizeHtmlValue(value);
  return composedHtmlToText(html) ? html : "";
}

export function composedHtmlToText(value: string): string {
  return convert(value, {
    decodeEntities: true,
    wordwrap: false,
    preserveNewlines: true,
    selectors: [{ selector: "img", format: "skip" }],
    limits: {
      maxInputLength: MAX_COMPOSED_HTML_BYTES,
      maxDepth: 40,
      maxChildNodes: 20_000,
    },
  }).replace(/\r\n?/g, "\n").trim();
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function plainTextToComposedHtml(value: string): string {
  return value.split(/\n{2,}/).map((paragraph) =>
    `<p>${paragraph.split("\n").map(escapeHtml).join("<br>") || "<br>"}</p>`,
  ).join("");
}

export function stripManagedBannerHtml(value: string): string {
  const withoutManagedSections = value
    .replace(/<!--rekad-banner-version:\d+-->/g, "")
    .replace(/<!--rekad-banner-header-start-->[\s\S]*?<!--\/rekad-banner-header-->/g, "")
    .replace(/<!--rekad-banner-footer-start-->[\s\S]*?<!--\/rekad-banner-footer-->/g, "");
  return sanitizeHtmlValue(withoutManagedSections);
}

export function managedBannerVersion(value: string): number | null {
  const match = /<!--rekad-banner-version:(\d+)-->/.exec(value);
  if (!match) return null;
  const version = Number(match[1]);
  return Number.isSafeInteger(version) && version >= 0 ? version : null;
}

/** Re-sanitizes message content and rebuilds the banners from the fixed markup, ignoring any stored banner HTML. */
export function sanitizeStoredManagedMessageHtml(value: string): string {
  const version = managedBannerVersion(value);
  if (version === null) return sanitizeComposedHtml(value);
  return buildManagedMessageHtml(stripManagedBannerHtml(value), {
    ...getFixedMailBanners(),
    version,
  });
}

export function prepareManagedMessageContent(
  content: { body: string; htmlBody?: string | null },
  banners: ManagedMailBanners,
): { body: string; htmlBody: string } {
  const userHtml = sanitizeComposedHtml(content.htmlBody ?? plainTextToComposedHtml(content.body));
  const htmlBody = buildManagedMessageHtml(userHtml, banners);
  const body = composedHtmlToText(htmlBody);
  if (Buffer.byteLength(body, "utf8") > MAX_COMPOSED_HTML_BYTES) {
    throw new RangeError("The formatted message is too large.");
  }
  return { body, htmlBody };
}

