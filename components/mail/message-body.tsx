"use client";

import { useState } from "react";
import { ExternalLinkDialog } from "./external-link-dialog";
import { MessageHtmlFrame } from "./message-html-frame";
import type { EmailDetail } from "./types";

export function MessageBody({
  detail,
}: {
  detail: Pick<EmailDetail, "htmlBody" | "textBody" | "bodyTruncated">;
}) {
  const [pendingLink, setPendingLink] = useState<string | null>(null);

  return (
    <section className="message-body-section" aria-label="Message body">
      {detail.htmlBody ? (
        <>
          <MessageHtmlFrame html={detail.htmlBody} onLinkClick={setPendingLink} />
          <p className="message-safety-note">
            Images and styling are blocked. Links ask before they open.
          </p>
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
