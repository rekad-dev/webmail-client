"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function policy(showRemoteImages: boolean) {
  return `default-src 'none'; script-src 'none'; img-src blob:${showRemoteImages ? " https: http:" : ""}; style-src 'unsafe-inline'; font-src 'none'; media-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'`;
}

const READING_STYLES = `
html { overflow: hidden; }
body { display: flow-root; margin: 0; color: #1f1f1f; font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; overflow-wrap: anywhere; word-break: normal; }
p, div { margin: 0 0 0.75em; }
blockquote { margin: 0.75em 0; border-left: 3px solid #d0d0d5; padding-left: 12px; color: #5a5a5a; }
pre, code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 14px; }
pre { white-space: pre-wrap; }
table { max-width: 100%; border-collapse: collapse; }
td, th { padding: 2px 6px; vertical-align: top; }
hr { border: 0; border-top: 1px solid #d0d0d5; }
a { color: #2b3058; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
img { max-width: 100%; height: auto; }
`;

function isolatedHtmlDocument(html: string, showRemoteImages: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy(showRemoteImages)}"></head><body>${html}</body></html>`;
}

/**
 * Renders sanitized message HTML in a frame that grows to fit its content.
 *
 * The frame is sandboxed without allow-scripts and carries a restrictive CSP.
 * allow-same-origin only lets this
 * component read the frame's size, apply reading styles through the CSSOM, and
 * intercept link clicks so the reader can confirm before leaving the app.
 */
export function MessageHtmlFrame({
  html,
  onLinkClick,
  inlineImages = {},
  showRemoteImages = false,
}: {
  html: string;
  /** Called with the link's destination; the frame never navigates on its own. */
  onLinkClick(href: string): void;
  inlineImages?: Record<string, string>;
  showRemoteImages?: boolean;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(96);
  const onLinkClickRef = useRef(onLinkClick);
  useEffect(() => {
    onLinkClickRef.current = onLinkClick;
  }, [onLinkClick]);

  const fit = useCallback(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    const view = frame?.contentWindow;
    if (!frame || !doc?.body || !view) return;
    try {
      if (!doc.adoptedStyleSheets.length) {
        const { CSSStyleSheet: FrameSheet } = view as unknown as { CSSStyleSheet: typeof CSSStyleSheet };
        const sheet = new FrameSheet();
        sheet.replaceSync(READING_STYLES);
        doc.adoptedStyleSheets = [sheet];
      }
    } catch {
      doc.body.style.margin = "0";
    }
    setHeight(Math.max(48, Math.ceil(doc.body.getBoundingClientRect().height)));
  }, []);

  const attachLinkGuard = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    const intercept = (event: Event) => {
      const target = event.target as Element | null;
      const link = target?.closest?.("a[href]");
      if (!link) return;
      event.preventDefault();
      if (event.type === "click") onLinkClickRef.current(link.getAttribute("href") ?? "");
    };
    doc.addEventListener("click", intercept, true);
    doc.addEventListener("auxclick", intercept, true);
  }, []);

  const applyImages = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    for (const image of doc.querySelectorAll<HTMLImageElement>("img[data-cid], img[data-remote-src]")) {
      const cid = image.getAttribute("data-cid");
      const remote = image.getAttribute("data-remote-src");
      const src = cid && Object.hasOwn(inlineImages, cid) ? inlineImages[cid] : !cid && showRemoteImages ? remote : null;
      image.referrerPolicy = "no-referrer";
      if (src) { image.addEventListener("load", fit, { once: true }); image.src = src; }
      else image.removeAttribute("src");
    }
  }, [fit, inlineImages, showRemoteImages]);

  useEffect(() => { applyImages(); }, [applyImages]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [fit]);

  return (
    <iframe
      className="message-html-frame"
      onLoad={() => {
        attachLinkGuard();
        applyImages();
        fit();
      }}
      ref={frameRef}
      referrerPolicy="no-referrer"
      sandbox="allow-same-origin"
      scrolling="no"
      srcDoc={isolatedHtmlDocument(html, showRemoteImages)}
      style={{ height }}
      title="Message content"
    />
  );
}
