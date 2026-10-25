import { convert } from "html-to-text";
import sanitizeHtml from "sanitize-html";

export const MAX_COMPOSED_HTML_BYTES = 256 * 1024;

export interface ManagedMailBanners {
  headerHtml: string;
  footerHtml: string;
  version: number;
}

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
    allowedAttributes: { a: ["href"] },
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

function versionMarker(version: number): string {
  return `<!--rekad-banner-version:${version}-->`;
}

function wrapBanner(
  placement: "header" | "footer",
  html: string,
): string {
  if (!html) return "";
  return `<!--rekad-banner-${placement}-start-->${html}<!--/rekad-banner-${placement}-->`;
}

export function buildManagedMessageHtml(
  userHtml: string,
  banners: ManagedMailBanners,
): string {
  const header = sanitizeHtmlValue(banners.headerHtml);
  const footer = sanitizeHtmlValue(banners.footerHtml);
  return [
    versionMarker(banners.version),
    wrapBanner("header", header),
    userHtml,
    wrapBanner("footer", footer),
  ].join("");
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

export function sanitizeStoredManagedMessageHtml(value: string): string {
  const version = managedBannerVersion(value);
  if (version === null) return sanitizeComposedHtml(value);
  const header = /<!--rekad-banner-header-start-->([\s\S]*?)<!--\/rekad-banner-header-->/.exec(value)?.[1] ?? "";
  const footer = /<!--rekad-banner-footer-start-->([\s\S]*?)<!--\/rekad-banner-footer-->/.exec(value)?.[1] ?? "";
  const userHtml = stripManagedBannerHtml(value);
  return buildManagedMessageHtml(userHtml, {
    headerHtml: sanitizeHtmlValue(header),
    footerHtml: sanitizeHtmlValue(footer),
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

