import { MailIcon } from "@/app/mail-icons";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "./format";
import type { EmailAttachment } from "./types";

export const MAX_ATTACHMENT_DOWNLOAD_BYTES = 4 * 1024 * 1024;

export function MessageAttachments({
  emailId,
  attachments,
}: {
  emailId: string;
  attachments: EmailAttachment[];
}) {
  if (attachments.length === 0) return null;

  return (
    <section className="message-attachments" aria-labelledby="attachment-heading">
      <h3 id="attachment-heading">
        Attachments <span>({attachments.length})</span>
      </h3>
      <ul>
        {attachments.map((attachment) => (
          <li key={`${attachment.attachmentIndex}-${attachment.name ?? "attachment"}`}>
            <span className="compose-file-icon" aria-hidden="true">
              <MailIcon name="file" size={16} />
            </span>
            <span className="compose-attachment-info">
              <span className="attachment-name" dir="auto">
                {attachment.name || "Unnamed attachment"}
              </span>
              <span className="attachment-details">
                {attachment.type || "Type unavailable"} · {formatFileSize(attachment.size)}
              </span>
            </span>
            {attachment.size !== null && attachment.size > MAX_ATTACHMENT_DOWNLOAD_BYTES ? (
              <span className="attachment-over-limit">Over 4 MiB</span>
            ) : (
              <Button asChild size="sm" variant="outline">
                <a
                  download
                  href={`/api/mail/attachments/download?emailId=${encodeURIComponent(emailId)}&attachmentIndex=${attachment.attachmentIndex}`}
                >
                  Download
                </a>
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p>Files download as attachments. Downloads are limited to 4 MiB per file.</p>
    </section>
  );
}
