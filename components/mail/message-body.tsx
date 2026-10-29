"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLinkDialog } from "./external-link-dialog";
import { MessageHtmlFrame } from "./message-html-frame";
import type { EmailDetail } from "./types";

export function MessageBody({
  detail,
  accountId,
}: {
  detail: Pick<EmailDetail, "id" | "htmlBody" | "textBody" | "bodyTruncated" | "inlineImages">;
  accountId?: string | null;
}) {
  const [pendingLink, setPendingLink] = useState<string | null>(null);
  const [showRemoteImages, setShowRemoteImages] = useState(false);
  const [inlineSources, setInlineSources] = useState<Record<string, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    const urls: string[] = [];
    const items = detail.inlineImages ?? [];
    setInlineSources({});
    async function loadInlineImages() {
      const sources: Record<string, string> = Object.create(null);
      let total = 0;
      for (const item of items) {
        if (controller.signal.aborted) break;
        if (!/^[a-z0-9._@+-]{1,256}$/i.test(item.cid) || !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(item.type) || !Number.isSafeInteger(item.size) || item.size < 0 || item.size > 4 * 1024 * 1024 || !Number.isSafeInteger(item.attachmentIndex) || item.attachmentIndex < 0 || item.attachmentIndex > 49 || total + item.size > 12 * 1024 * 1024 || Object.hasOwn(sources, item.cid)) continue;
        try {
          const params = new URLSearchParams({ emailId: detail.id, attachmentIndex: String(item.attachmentIndex) });
          if (accountId) params.set("accountId", accountId);
          const response = await fetch(`/api/mail/attachments/download?${params}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
          if (!response.ok) continue;
          const bytes = await response.arrayBuffer();
          if (controller.signal.aborted || bytes.byteLength !== item.size) continue;
          const url = URL.createObjectURL(new Blob([bytes], { type: item.type }));
          urls.push(url);
          sources[item.cid] = url;
          total += item.size;
        } catch { /* Missing images do not prevent reading the message. */ }
      }
      if (!controller.signal.aborted) setInlineSources(sources);
    }
    void loadInlineImages();
    return () => { controller.abort(); for (const url of urls) URL.revokeObjectURL(url); };
  }, [detail.id, detail.inlineImages, accountId]);

  return (
    <section className="message-body-section" aria-label="Message body">
      {detail.htmlBody ? (
        <>
          <MessageHtmlFrame html={detail.htmlBody} inlineImages={inlineSources} showRemoteImages={showRemoteImages} onLinkClick={setPendingLink} />
          {detail.htmlBody.includes("data-remote-src=") && !showRemoteImages ? (
            <div className="message-remote-images">
              <span>Remote images are blocked to protect your privacy.</span>
              <Button onClick={() => setShowRemoteImages(true)} size="sm" variant="outline">Show images</Button>
            </div>
          ) : null}
        </>
      ) : detail.textBody ? (
        <pre className="message-plain-body">{detail.textBody}</pre>
      ) : (
        <p className="message-body-empty">
          This message does not contain a readable text or HTML body.
        </p>
      )}

      {detail.bodyTruncated ? (
        <p className="message-safety-note">
          The message body is shortened to keep this view within a safe size limit.
        </p>
      ) : null}

      <ExternalLinkDialog href={pendingLink} onClose={() => setPendingLink(null)} />
    </section>
  );
}
