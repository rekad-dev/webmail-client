"use client";

import { useId } from "react";
import { MailIcon } from "@/app/mail-icons";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MessageActionsMenu } from "./message-actions-menu";
import { addressLabel, avatarTone, formatDetailDate, senderInitials, senderLabel } from "./format";
import type { EmailDetail, MailAction, Mailbox } from "./types";

interface MessageSenderRowProps {
  detail: EmailDetail;
  mailboxes: Mailbox[];
  actionPending: boolean;
  offlineAvailable: boolean;
  offlineSaved: boolean;
  offlineSavePending: boolean;
  allowOriginal: boolean;
  onAction(action: MailAction): void;
  onMove(destinationMailboxId: string): void;
  onReply(detail: EmailDetail, trigger: HTMLButtonElement): void;
  onForward(detail: EmailDetail, trigger: HTMLButtonElement): void;
  onToggleOffline(detail: EmailDetail): void;
}

function recipientSummary(detail: EmailDetail): string {
  const recipients = [...detail.to, ...detail.cc];
  if (recipients.length === 0) return "Message details";
  const names = recipients.slice(0, 2).map((address) => address.name?.trim() || address.email).join(", ");
  return `to ${names}${recipients.length > 2 ? ` +${recipients.length - 2}` : ""}`;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Sender, recipients summary with expandable details, date, and quick actions. */
export function MessageSenderRow({
  detail,
  mailboxes,
  actionPending,
  offlineAvailable,
  offlineSaved,
  offlineSavePending,
  allowOriginal,
  onAction,
  onMove,
  onReply,
  onForward,
  onToggleOffline,
}: MessageSenderRowProps) {
  const detailsPanelId = useId();
  const receivedAt = formatDetailDate(detail.receivedAt);
  const sentAt = formatDetailDate(detail.sentAt);
  const displayDate = receivedAt ?? sentAt;

  return (
    <Collapsible asChild>
      <div className="message-detail-sender-row">
        <span className={`message-avatar avatar-tone-${avatarTone(detail)}`} aria-hidden="true">
          {senderInitials(detail)}
        </span>
        <div className="message-detail-sender-copy">
          <div className="message-detail-sender-line">
            <strong dir="auto">{senderLabel(detail)}</strong>
            <span>{detail.from[0]?.email ? `<${detail.from[0].email}>` : "Unknown address"}</span>
          </div>
          <CollapsibleTrigger asChild>
            <button aria-controls={detailsPanelId} className="message-details-toggle" type="button">
              <span>{recipientSummary(detail)}</span>
              <MailIcon name="chevron-down" size={14} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent asChild>
            <dl className="message-metadata" id={detailsPanelId}>
              {detail.from.length > 0 ? <DetailRow label="From"><span dir="auto">{detail.from.map(addressLabel).join(", ")}</span></DetailRow> : null}
              {detail.replyTo.length > 0 ? <DetailRow label="Reply-to"><span dir="auto">{detail.replyTo.map(addressLabel).join(", ")}</span></DetailRow> : null}
              {detail.to.length > 0 ? <DetailRow label="To"><span dir="auto">{detail.to.map(addressLabel).join(", ")}</span></DetailRow> : null}
              {detail.cc.length > 0 ? <DetailRow label="Cc"><span dir="auto">{detail.cc.map(addressLabel).join(", ")}</span></DetailRow> : null}
              {detail.bcc.length > 0 ? <DetailRow label="Bcc"><span dir="auto">{detail.bcc.map(addressLabel).join(", ")}</span></DetailRow> : null}
              {sentAt ? <DetailRow label="Sent"><time dateTime={detail.sentAt ?? undefined}>{sentAt}</time></DetailRow> : null}
              {receivedAt ? <DetailRow label="Received"><time dateTime={detail.receivedAt ?? undefined}>{receivedAt}</time></DetailRow> : null}
            </dl>
          </CollapsibleContent>
        </div>
        <div className="message-detail-tools">
          {displayDate ? (
            <time className="message-detail-timestamp" dateTime={(detail.receivedAt ?? detail.sentAt) ?? undefined}>
              {displayDate}
            </time>
          ) : null}
          <Button
            aria-label={detail.isStarred ? "Remove star" : "Add star"}
            aria-pressed={detail.isStarred}
            className={detail.isStarred ? "message-star-button is-starred" : "message-star-button"}
            disabled={actionPending}
            onClick={() => onAction(detail.isStarred ? "unstar" : "star")}
            size="icon"
            title={detail.isStarred ? "Remove star" : "Add star"}
            variant="ghost"
          >
            <MailIcon name="star" size={18} />
          </Button>
          <Button
            aria-label="Reply"
            disabled={actionPending}
            onClick={(event) => onReply(detail, event.currentTarget)}
            size="icon"
            title="Reply"
            variant="ghost"
          >
            <MailIcon name="reply" size={18} />
          </Button>
          <MessageActionsMenu
            actionPending={actionPending}
            currentMailboxIds={detail.mailboxIds}
            isStarred={detail.isStarred}
            isUnread={detail.isUnread}
            mailboxes={mailboxes}
            offlineAvailable={offlineAvailable}
            offlineSavePending={offlineSavePending}
            offlineSaved={offlineSaved}
            onArchive={() => onAction("archive")}
            onForward={(trigger) => onForward(detail, trigger)}
            onMove={onMove}
            onReply={(trigger) => onReply(detail, trigger)}
            onToggleOffline={() => onToggleOffline(detail)}
            onToggleRead={() => onAction(detail.isUnread ? "mark_read" : "mark_unread")}
            onToggleStar={() => onAction(detail.isStarred ? "unstar" : "star")}
            onTrash={() => onAction("trash")}
            originalHref={allowOriginal ? `/message/original?emailId=${encodeURIComponent(detail.id)}` : null}
          />
        </div>
      </div>
    </Collapsible>
  );
}
