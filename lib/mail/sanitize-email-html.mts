import sanitizeHtml from "sanitize-html";

const MAX_EMAIL_HTML_CHARS = 262_144;
const MAX_EXTERNAL_LINKS = 50;
const MAX_LINK_LENGTH = 2_048;

const EMAIL_HTML_TAGS = [
  "a",
  "b",
  "blockquote",
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

export function sanitizeEmailHtml(dirtyHtml: string): SanitizedEmailHtml {
  const externalLinks = new Set<string>();
  const source = dirtyHtml.slice(0, MAX_EMAIL_HTML_CHARS);

  const html = sanitizeHtml(source, {
    allowedTags: [...EMAIL_HTML_TAGS],
    allowedAttributes: {
      a: ["href"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    nestingLimit: 50,
    parseStyleAttributes: false,
    transformTags: {
      a: (_tagName, attributes) => {
        const href = typeof attributes.href === "string"
          ? normalizeExternalLink(attributes.href)
          : null;
        if (href && externalLinks.size < MAX_EXTERNAL_LINKS) {
          externalLinks.add(href);
        }
        return { tagName: "span", attribs: {} };
      },
    },
  });

  return { html, externalLinks: [...externalLinks] };
}
