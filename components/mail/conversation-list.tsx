"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { MailIcon } from "@/app/mail-icons";
import { ConversationRowMenu } from "./conversation-row-menu";
import { avatarTone, formatDate, senderInitials, senderLabel } from "./format";
import type { EmailSummary, MailAction, Mailbox } from "./types";

interface ConversationListProps {
  messages: EmailSummary[];
  mailboxes: Mailbox[];
  selectedThreadIds: Set<string>;
  openThreadId: string | null;
  isLoading: boolean;
  actionPending: boolean;
  localPreview: boolean;
  archiveAvailable: boolean;
  trashAvailable: boolean;
  /** Prefix for the ids that describe each row's preview. */
  previewId: string;
  canOpen(message: EmailSummary): boolean;
  onToggleSelect(threadId: string, selected: boolean): void;
  onOpenDraft(message: EmailSummary, trigger: HTMLButtonElement): void;
  onOpenConversation(message: EmailSummary): void;
  onAction(action: MailAction, threadId: string): void;
  onMove(threadId: string, mailboxId: string): void;
}

export function ConversationList({
  messages,
  mailboxes,
  selectedThreadIds,
  openThreadId,
  isLoading,
  actionPending,
  localPreview,
  archiveAvailable,
  trashAvailable,
  previewId,
  canOpen,
  onToggleSelect,
  onOpenDraft,
  onOpenConversation,
  onAction,
  onMove,
}: ConversationListProps) {
  return (
    <ol className={`message-list${isLoading ? " is-loading" : ""}`} aria-label="Conversations">
      {messages.map((message, index) => {
        const subject = message.subject?.trim() || "(no subject)";
        const sender = senderLabel(message);
        const previewElementId = `${previewId}-list-${index}`;
        const blocked = localPreview && !canOpen(message);
        return (
          <li
            className={`conversation-list-item${!localPreview && !message.isDraft ? " has-row-actions" : ""}${selectedThreadIds.has(message.threadId) ? " is-selected" : ""}${openThreadId === message.threadId ? " is-open" : ""}`}
            key={message.threadId}
          >
            <div className="conversation-select">
              <Checkbox
                aria-label={`Select conversation from ${sender}: ${subject}`}
                checked={selectedThreadIds.has(message.threadId)}
                disabled={localPreview || message.isDraft || actionPending || isLoading}
                onCheckedChange={(checked) => onToggleSelect(message.threadId, checked === true)}
                title={message.isDraft ? "Open this draft to edit it" : undefined}
              />
            </div>
            <button
              type="button"
              className={`message-row${message.isUnread ? " is-unread" : ""}`}
              disabled={actionPending || blocked}
              data-email-id={message.id}
              data-thread-id={message.threadId}
              title={blocked ? "Opening sample messages is disabled in the local preview" : undefined}
              aria-label={`${message.isDraft ? "Edit saved draft" : `Open ${message.isUnread ? "unread" : "read"} conversation`}${message.isStarred ? ", starred" : ""} from ${sender}: ${subject}`}
              aria-describedby={message.preview.trim() ? previewElementId : undefined}
              onClick={(event) => {
                if (message.isDraft) onOpenDraft(message, event.currentTarget);
                else onOpenConversation(message);
              }}
            >
              <span className={`message-avatar avatar-tone-${avatarTone(message)}`} aria-hidden="true">{senderInitials(message)}</span>
              <span className="message-sender">{sender}{message.isStarred ? <span className="conversation-star" aria-hidden="true"> ★</span> : null}</span>
              <span className="message-copy">
                <span className="message-subject">{message.isDraft ? <em>Draft: </em> : null}{subject}</span>
                <span className="message-preview" id={previewElementId}>{message.preview}</span>
              </span>
              <time className="message-date" dateTime={message.receivedAt ?? undefined}>{formatDate(message.receivedAt)}</time>
            </button>
            {!localPreview && !message.isDraft ? (
              <div className="conversation-row-actions">
                <div className="conversation-quick-actions">
                  <Button aria-label={`Archive conversation from ${sender}`} title="Archive" size="icon" variant="ghost" disabled={actionPending || isLoading || !archiveAvailable} onClick={() => onAction("archive", message.threadId)}><MailIcon name="archive" size={18} /></Button>
                  <Button aria-label={`Move conversation from ${sender} to Trash`} title="Move to Trash" size="icon" variant="ghost" disabled={actionPending || isLoading || !trashAvailable} onClick={() => onAction("trash", message.threadId)}><MailIcon name="trash" size={18} /></Button>
                  <Button aria-label={`${message.isUnread ? "Mark read" : "Mark unread"} conversation from ${sender}`} title={message.isUnread ? "Mark read" : "Mark unread"} size="icon" variant="ghost" disabled={actionPending || isLoading} onClick={() => onAction(message.isUnread ? "mark_read" : "mark_unread", message.threadId)}><MailIcon name="mail" size={18} /></Button>
                </div>
                <ConversationRowMenu
                  actionPending={actionPending || isLoading}
                  archiveAvailable={archiveAvailable}
                  isStarred={message.isStarred}
                  isUnread={message.isUnread}
                  label={sender}
                  mailboxes={mailboxes}
                  onAction={(action) => onAction(action, message.threadId)}
                  onMove={(mailboxId) => onMove(message.threadId, mailboxId)}
                  trashAvailable={trashAvailable}
                />
              </div>
            ) : <span />}
          </li>
        );
      })}
    </ol>
  );
}
