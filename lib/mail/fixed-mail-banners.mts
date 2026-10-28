import type { ManagedMailBanners } from "./composed-content.mts";

/**
 * Every outgoing message gets the same rekad header image and footer. The
 * markup is written here, never read from user input or storage, so it is
 * added after message content is sanitized. Bump the version whenever this
 * markup changes so older saved drafts are rebuilt before they can be sent.
 */
export const FIXED_BANNER_VERSION = 1;

const HEADER_IMAGE_URL = "https://webmail.rekad.id/mail-header.png";
const WEBSITE_URL = "https://www.rekad.id";
const INSTAGRAM_URL = "https://www.instagram.com/rekad.id";

const FONT = "Arial,Helvetica,sans-serif";

export function fixedHeaderHtml(): string {
  return (
    '<div style="margin:0;background:#f6f6f6;padding:24px 12px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="max-width:600px;margin:0 auto;border-collapse:collapse;">' +
    '<tr><td style="background:#ffffff;padding:0;">' +
    `<img src="${HEADER_IMAGE_URL}" alt="rekad" width="600" ` +
    'style="display:block;width:100%;max-width:600px;height:auto;border:0;">' +
    "</td></tr>" +
    `<tr><td style="background:#ffffff;padding:24px 32px;font-family:${FONT};font-size:16px;line-height:1.6;color:#1f1f1f;">`
  );
}

export function fixedFooterHtml(year: number): string {
  const link = `style="color:#8a8a8a;text-decoration:none;"`;
  return (
    "</td></tr>" +
    `<tr><td align="center" style="padding:28px 12px 8px;font-family:${FONT};font-size:13px;line-height:1.7;color:#8a8a8a;text-align:center;">` +
    `Copyright &copy; ${year} rekad<br><br>` +
    `<a href="${WEBSITE_URL}" ${link}>www.rekad.id</a>` +
    ' &nbsp;|&nbsp; ' +
    `<a href="${INSTAGRAM_URL}" ${link}>Instagram</a>` +
    "</td></tr></table></div>"
  );
}

export function getFixedMailBanners(now: Date = new Date()): ManagedMailBanners {
  return {
    headerHtml: fixedHeaderHtml(),
    footerHtml: fixedFooterHtml(now.getUTCFullYear()),
    version: FIXED_BANNER_VERSION,
  };
}
