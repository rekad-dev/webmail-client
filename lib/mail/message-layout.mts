export interface ManagedMailBanners {
  headerHtml: string;
  footerHtml: string;
  version: number;
}

export const REPLY_HISTORY_ATTRIBUTE = "data-rekad-reply-history";

/** Only a top-level, explicitly marked reply quote is moved outside the frame. */
function replyHistoryOffset(html: string): number {
  let depth = 0;
  for (const match of html.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi)) {
    const tag = match[0];
    const name = match[1].toLowerCase();
    if (tag.startsWith("</")) {
      depth = Math.max(0, depth - 1);
    } else {
      if (depth === 0 && name === "blockquote" && tag.includes(`${REPLY_HISTORY_ATTRIBUTE}="true"`)) {
        return match.index;
      }
      if (name !== "br" && name !== "hr" && !tag.endsWith("/>")) depth += 1;
    }
  }
  return html.length;
}

function wrapBanner(placement: "header" | "footer", html: string): string {
  return html ? `<!--rekad-banner-${placement}-start-->${html}<!--/rekad-banner-${placement}-->` : "";
}

/** Shared by preview and outgoing mail. Banner markup must be trusted application markup. */
export function buildManagedMessageHtml(userHtml: string, banners: ManagedMailBanners): string {
  const boundary = replyHistoryOffset(userHtml);
  const styleQuotes = (html: string) => html.replace(
    /<blockquote( data-rekad-reply-history="true")?>/g,
    '<blockquote$1 style="margin:0.75em 0;border-left:3px solid #b4b4bd;padding-left:12px;color:#555555;">',
  );
  return [
    `<!--rekad-banner-version:${banners.version}-->`,
    wrapBanner("header", banners.headerHtml),
    styleQuotes(userHtml.slice(0, boundary)),
    wrapBanner("footer", banners.footerHtml),
    styleQuotes(userHtml.slice(boundary)),
  ].join("");
}
