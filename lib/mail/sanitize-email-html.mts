import sanitizeHtml from "sanitize-html";

const MAX_EMAIL_HTML_CHARS = 262_144;
const MAX_EXTERNAL_LINKS = 50;
const MAX_LINK_LENGTH = 2_048;

const EMAIL_HTML_TAGS = [
  "a",
  "abbr",
  "address",
  "article",
  "b",
  "blockquote",
  "center",
  "cite",
  "col",
  "colgroup",
  "figcaption",
  "figure",
  "font",
  "footer",
  "header",
  "section",
  "tfoot",
  "h5",
  "h6",
  "br",
  "caption",
  "code",
  "dd",
  "del",
  "div",
  "dl",
  "dt",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
  "img",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
] as const;

export interface SanitizedEmailHtml {
  html: string;
  externalLinks: string[];
}

function normalizeExternalLink(value: string): string | null {
  if (value.length === 0 || value.length > MAX_LINK_LENGTH) return null;

  try {
    const url = new URL(value);
    if (url.protocol === "mailto:") {
      return url.pathname ? url.href : null;
    }
    if (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.hostname &&
      !url.username &&
      !url.password
    ) {
      return url.href;
    }
  } catch {
    return null;
  }

  return null;
}

function imageReference(value: string): { cid?: string; remote?: string } {
  if (value.length > MAX_LINK_LENGTH) return {};
  if (/^cid:/i.test(value)) {
    try {
      const cid = decodeURIComponent(value.slice(4)).replace(/^<|>$/g, "");
      return /^[a-z0-9._@+-]{1,256}$/i.test(cid) ? { cid } : {};
    } catch { return {}; }
  }
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    const localHost = !host.includes(".") || host.startsWith("[") || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || /\.(?:localhost|local|internal)$/.test(host);
    if ((url.protocol === "https:" || url.protocol === "http:") && !localHost && !url.username && !url.password) return { remote: url.href };
  } catch { /* Invalid image URLs are discarded. */ }
  return {};
}

const importantSuffix = "(?:\\s*!important)?";
const colorBody = "(?:#[0-9a-f]{3,8}|(?:black|white|red|blue|green|gray|grey|yellow|orange|purple|transparent|inherit)|(?:rgba?|hsla?)\\(\\s*[\\d.,%\\s/deg]+\\))";
const color = new RegExp(`^${colorBody}${importantSuffix}$`, "i");
const solidBorder = new RegExp(`^(?:0|\\d{1,2}px)\\s+(?:solid|none)\\s+${colorBody}${importantSuffix}$`, "i");
const length = /^(?:0|\d{1,4}(?:\.\d{1,2})?(?:px|pt|em|rem|%))(?:\s+(?:0|\d{1,4}(?:\.\d{1,2})?(?:px|pt|em|rem|%))){0,3}$/i;

export function sanitizeEmailHtml(dirtyHtml: string): SanitizedEmailHtml {
  const externalLinks = new Set<string>();
  let imageCount = 0;
  const source = dirtyHtml.slice(0, MAX_EMAIL_HTML_CHARS);

  const html = sanitizeHtml(source, {
    allowedTags: [...EMAIL_HTML_TAGS],
    allowedAttributes: {
      "*": ["style"],
      a: ["href", "rel"],
      img: ["data-cid", "data-remote-src", "alt", "width", "height", "align"],
      table: ["width", "height", "align", "bgcolor", "border", "cellpadding", "cellspacing"],
      td: ["colspan", "rowspan", "width", "height", "align", "valign", "bgcolor"],
      th: ["colspan", "rowspan", "width", "height", "align", "valign", "bgcolor"],
      tr: ["align", "valign", "bgcolor"],
      col: ["width", "span"],
      colgroup: ["width", "span"],
      font: ["color", "size"],
      div: ["align"],
      p: ["align"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    nestingLimit: 50,
    allowedStyles: { "*": {
      color: [color], "background-color": [color], background: [color],
      display: [/^(?:inline|inline-block|block|table|table-cell)$/i], "border-radius": [length],
      border: [solidBorder, /^none$/i], "border-top": [solidBorder, /^none$/i], "border-bottom": [solidBorder, /^none$/i],
      "border-left": [solidBorder, /^none$/i], "border-right": [solidBorder, /^none$/i],
      "border-color": [color], "vertical-align": [/^(?:top|middle|bottom|baseline|text-top|text-bottom)$/i],
      "min-width": [length], "max-height": [length], "min-height": [length], "margin-left": [length], "margin-right": [length],
      "text-transform": [/^(?:none|uppercase|lowercase|capitalize)$/i], "letter-spacing": [length],
      "white-space": [/^(?:normal|nowrap|pre-wrap)$/i], "border-spacing": [length],
      "font-family": [/^[\w\s,"'-]{1,200}$/], "font-size": [length],
      "font-weight": [/^(?:normal|bold|[1-9]00)$/i], "font-style": [/^(?:normal|italic)$/i],
      "text-align": [/^(?:left|right|center|justify)$/i], "text-decoration": [/^(?:none|underline|line-through)$/i],
      "line-height": [/^(?:normal|\d{1,3}(?:\.\d{1,2})?(?:px|pt|em|%)?)$/i],
      margin: [length], padding: [length], "margin-top": [length], "margin-bottom": [length],
      "padding-top": [length], "padding-bottom": [length], "padding-left": [length], "padding-right": [length],
      width: [length, /^auto$/i], "max-width": [length], height: [length, /^auto$/i],
      "border-collapse": [/^(?:collapse|separate)$/i],
    } },
    transformTags: {
      a: (_tagName, attributes) => {
        const href = typeof attributes.href === "string"
          ? normalizeExternalLink(attributes.href)
          : null;
        if (href && externalLinks.size < MAX_EXTERNAL_LINKS) {
          externalLinks.add(href);
        }
        // The reader intercepts clicks and asks before leaving the app.
        const attribs: Record<string, string> = href
          ? { href, rel: "noopener noreferrer nofollow" }
          : {};
        if (typeof attributes.style === "string") attribs.style = attributes.style;
        return { tagName: href ? "a" : "span", attribs };
      },
      img: (_tagName, attributes) => {
        const reference = imageReference(typeof attributes.src === "string" ? attributes.src : "");
        if (++imageCount > 30 || (!reference.cid && !reference.remote)) return { tagName: "span", attribs: {} };
        return { tagName: "img", attribs: {
          ...(reference.cid ? { "data-cid": reference.cid } : {}),
          ...(reference.remote ? { "data-remote-src": reference.remote } : {}),
          ...(typeof attributes.alt === "string" ? { alt: attributes.alt.slice(0, 256) } : {}),
          ...(typeof attributes.style === "string" ? { style: attributes.style } : {}),
          ...(typeof attributes.width === "string" && /^\d{1,4}%?$/.test(attributes.width) ? { width: attributes.width } : {}),
          ...(typeof attributes.height === "string" && /^\d{1,4}%?$/.test(attributes.height) ? { height: attributes.height } : {}),
        } };
      },
    },
  });

  return { html, externalLinks: [...externalLinks] };
}
