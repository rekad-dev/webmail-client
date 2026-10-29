"use client";

import type { RefObject } from "react";
import { MailIcon } from "@/app/mail-icons";
import { Button } from "@/components/ui/button";
import { SenderAvatar } from "@/components/profile/sender-avatar";
import { avatarTone, formatDate, senderInitials, senderLabel } from "./format";
import { MoveToMenu } from "./move-to-menu";
import type { MailAction, Mailbox, ThreadView } from "./types";

export type MailTarget = { emailId: string } | { threadId: string };

interface ConversationThreadProps {
  threadId: string;
  threadView: ThreadView | null;
  isLoading: boolean;
  isRefreshing: boolean;
  hasError: boolean;
  actionError: string | null;
  mailboxName: string;
  mailboxes: Mailbox[];
  localPreview: boolean;
  actionPending: boolean;
  backButtonRef: RefObject<HTMLButtonElement | null>;
  /** Prefix for the ids that describe each message's preview. */
  previewId: string;
  onBack(): void;
  onRetry(): void;
  onAction(action: MailAction, target: MailTarget): void;
  onMove(target: MailTarget, mailboxId: string): void;
  onOpenMessage(emailId: string): void;
  onOpenDraft(emailId: string, trigger: HTMLButtonElement, subject: string | null): void;
}

export function ConversationThread({
  threadId,
  threadView,
  isLoading,
  isRefreshing,
  hasError,
  actionError,
  mailboxName,
  mailboxes,
  localPreview,
  actionPending,
  backButtonRef,
  previewId,
  onBack,
  onRetry,
  onAction,
  onMove,
  onOpenMessage,
  onOpenDraft,
}: ConversationThreadProps) {
  const threadTarget: MailTarget = { threadId };
  const bulkBlocked = localPreview || actionPending || Boolean(threadView?.truncated);

  return (
    <section className="thread-view" aria-label="Conversation">
      <button className="detail-back" onClick={onBack} ref={backButtonRef} type="button">
        <span aria-hidden="true">←</span>
        Back to {mailboxName}
      </button>
      {isLoading ? (
        <div className="mail-state" role="status" aria-live="polite">
          <span className="loading-indicator" aria-hidden="true" />
          <p>{isRefreshing ? "Refreshing conversation…" : "Opening conversation…"}</p>
        </div>
      ) : null}
      {hasError ? (
        <div className="mail-alert" role="alert">
          <p>This conversation could not be loaded.</p>
          <Button onClick={onRetry} size="sm" variant="outline">Try again</Button>
        </div>
      ) : null}
      {actionError ? <p className="mail-alert" role="alert">{actionError}</p> : null}
      {threadView && !isLoading ? (
        <>
          <header className="thread-header">
            <div className="thread-title-group">
              <p className="eyebrow">
                Conversation · {threadView.messages.length}{threadView.truncated ? "+" : ""} {threadView.messages.length === 1 ? "message" : "messages"}
              </p>
              <h2>{threadView.messages[threadView.messages.length - 1]?.subject?.trim() || "(no subject)"}</h2>
            </div>
            <div className="thread-actions" role="group" aria-label="Conversation actions">
              <div className="bulk-action-group">
                <Button
                  disabled={bulkBlocked}
                  onClick={() => onAction(threadView.messages.some((message) => message.isUnread) ? "mark_read" : "mark_unread", threadTarget)}
                  size="sm"
                  variant="ghost"
                >
                  <MailIcon name="mail" size={18} />
                  <span>{threadView.messages.some((message) => message.isUnread) ? "Mark all read" : "Mark all unread"}</span>
                </Button>
                <Button
                  disabled={bulkBlocked}
                  onClick={() => onAction(threadView.messages.some((message) => message.isStarred) ? "unstar" : "star", threadTarget)}
                  size="sm"
                  variant="ghost"
                >
                  <MailIcon name="star" size={18} />
                  <span>{threadView.messages.some((message) => message.isStarred) ? "Unstar all" : "Star all"}</span>
                </Button>
                <MoveToMenu
                  ariaLabel="Move conversation to mailbox"
                  disabled={bulkBlocked}
                  mailboxes={mailboxes}
                  onMove={(mailboxId) => onMove(threadTarget, mailboxId)}
                />
                <Button disabled={bulkBlocked} onClick={() => onAction("archive", threadTarget)} size="sm" variant="ghost">
                  <MailIcon name="archive" size={18} />
                  <span>Archive</span>
                </Button>
                <Button disabled={bulkBlocked} onClick={() => onAction("trash", threadTarget)} size="sm" variant="ghost">
                  <MailIcon name="trash" size={18} />
                  <span>Trash</span>
                </Button>
              </div>
              {threadView.messages.some((message) => !message.isDraft) ? (
                <Button
                  disabled={actionPending}
                  onClick={() => {
                    const latest = [...threadView.messages].reverse().find((message) => !message.isDraft);
                    if (latest) onOpenMessage(latest.id);
                  }}
                >
                  <MailIcon name="reply" size={18} />
                  <span>Reply</span>
                </Button>
              ) : null}
            </div>
          </header>
          {threadView.truncated ? (
            <p className="thread-truncated-note" role="status">
              Showing the latest 100 messages. Bulk conversation actions are unavailable; message actions still work for the messages shown.
            </p>
          ) : null}
          <ol className="thread-message-list" aria-label="Messages in this conversation">
            {threadView.messages.map((message, index) => {
              const target: MailTarget = { emailId: message.id };
              const blocked = localPreview || actionPending;
              return (
                <li className="thread-message-card" key={message.id}>
                  <button
                    className={`thread-message-open${message.isUnread ? " is-unread" : ""}`}
                    data-email-id={message.id}
                    aria-label={`${message.isDraft ? "Edit saved draft" : `Open ${message.isUnread ? "unread" : "read"} message`}${message.isStarred ? ", starred" : ""} from ${senderLabel(message)}: ${message.subject?.trim() || "(no subject)"}`}
                    aria-describedby={message.preview.trim() ? `${previewId}-thread-${index}` : undefined}
                    onClick={(event) => message.isDraft
                      ? onOpenDraft(message.id, event.currentTarget, message.subject)
                      : onOpenMessage(message.id)}
                    type="button"
                  >
                    <SenderAvatar address={message.from[0]?.email} initials={senderInitials(message)} tone={avatarTone(message)} />
                    <span className="message-copy">
                      <span className="message-sender">
                        {senderLabel(message)}
                        {message.isStarred ? <span className="conversation-star" aria-hidden="true"> ★</span> : null}
                      </span>
                      <span className="message-subject">{message.subject?.trim() || "(no subject)"}</span>
                      <span className="message-preview" id={`${previewId}-thread-${index}`}>{message.preview}</span>
                    </span>
                    <time className="message-date" dateTime={message.receivedAt ?? undefined}>{formatDate(message.receivedAt)}</time>
                  </button>
                  {!message.isDraft ? (
                    <div className="thread-message-actions" role="group" aria-label={`Actions for message from ${senderLabel(message)}`}>
                      <div className="bulk-action-group">
                        <Button
                          disabled={blocked}
                          onClick={() => onAction(message.isUnread ? "mark_read" : "mark_unread", target)}
                          size="sm"
                          variant="ghost"
                        >
                          <MailIcon name="mail" size={16} />
                          <span>{message.isUnread ? "Mark read" : "Mark unread"}</span>
                        </Button>
                        <Button
                          aria-pressed={message.isStarred}
                          disabled={blocked}
                          onClick={() => onAction(message.isStarred ? "unstar" : "star", target)}
                          size="sm"
                          variant="ghost"
                        >
                          <MailIcon name="star" size={16} />
                          <span>{message.isStarred ? "Unstar" : "Star"}</span>
                        </Button>
                        <MoveToMenu
                          ariaLabel="Move this message to mailbox"
                          disabled={blocked}
                          mailboxes={mailboxes}
                          onMove={(mailboxId) => onMove(target, mailboxId)}
                        />
                        <Button disabled={blocked} onClick={() => onAction("archive", target)} size="sm" variant="ghost">
                          <MailIcon name="archive" size={16} />
                          <span>Archive</span>
                        </Button>
                        <Button disabled={blocked} onClick={() => onAction("trash", target)} size="sm" variant="ghost">
                          <MailIcon name="trash" size={16} />
                          <span>Trash</span>
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </>
      ) : null}
    </section>
  );
}
