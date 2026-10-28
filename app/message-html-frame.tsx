"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLICY =
  "default-src 'none'; script-src 'none'; img-src 'none'; style-src 'none'; font-src 'none'; media-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";

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
`;

function isolatedHtmlDocument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${POLICY}"></head><body>${html}</body></html>`;
}

/**
 * Renders sanitized message HTML in a frame that grows to fit its content.
 *
 * The frame is sandboxed without allow-scripts and carries a CSP that blocks
 * scripts, styles, images, and navigation, so allow-same-origin only lets this
 * component read the frame's size and apply reading styles through the CSSOM.
 */
export function MessageHtmlFrame({ html }: { html: string }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(96);

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
      onLoad={fit}
      ref={frameRef}
      referrerPolicy="no-referrer"
      sandbox="allow-same-origin"
      scrolling="no"
      srcDoc={isolatedHtmlDocument(html)}
      style={{ height }}
      title="Message content"
    />
  );
}
