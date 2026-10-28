"use client";

import type { RefObject } from "react";
import { MailIcon } from "@/app/mail-icons";
import { Button } from "@/components/ui/button";
import { MessageAttachments } from "./message-attachments";
import { MessageBody } from "./message-body";
import { MessageSenderRow } from "./message-sender-row";
import type { EmailDetail, MailAction, Mailbox } from "./types";

function detailErrorMessage(error: string): string {
  if (error === "sign_in_required") {
    return "Your mail session is no longer available. Sign in again to continue.";
  }
  if (error === "message_not_found") {
    return "This message is no longer available in your mailbox.";
  }
  return "This message could not be loaded. Check your connection and try again.";
}

interface MessageDetailViewProps {
  detail: EmailDetail | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  readUpdateError: boolean;
  mailboxName: string;
  backButtonRef: RefObject<HTMLButtonElement | null>;
  headingRef: RefObject<HTMLHeadingElement | null>;
  allowOriginal: boolean;
  accountId?: string | null;
  mailboxes: Mailbox[];
  actionPending: boolean;
  actionError: string | null;
  offlineAvailable: boolean;
  offlineSaved: boolean;
  offlineSavePending: boolean;
  offlineSaveError: string | null;
  onBack(): void;
  onClose(): void;
  onRetry(): void;
  onAction(action: MailAction): void;
  onMove(destinationMailboxId: string): void;
  onReply(detail: EmailDetail, trigger: HTMLButtonElement): void;
  onForward(detail: EmailDetail, trigger: HTMLButtonElement): void;
  onToggleOffline(detail: EmailDetail): void;
}

export function MessageDetailView({
  detail,
  isLoading,
  isRefreshing,
  error,
  readUpdateError,
  mailboxName,
  backButtonRef,
  headingRef,
  allowOriginal,
  accountId,
  mailboxes,
  actionPending,
  actionError,
  offlineAvailable,
  offlineSaved,
  offlineSavePending,
  offlineSaveError,
  onBack,
  onClose,
  onRetry,
  onAction,
  onMove,
  onReply,
  onForward,
  onToggleOffline,
}: MessageDetailViewProps) {
  const backButton = (
    <button className="detail-back" onClick={onBack} ref={backButtonRef} type="button">
      <span aria-hidden="true">←</span>
      Back to {mailboxName}
    </button>
  );

  if (isLoading) {
    return (
      <section className="message-detail" aria-label="Message detail">
        {backButton}
        <div className="mail-state" role="status" aria-live="polite">
          <span className="loading-indicator" aria-hidden="true" />
          <p>{isRefreshing ? "Refreshing message…" : "Opening message…"}</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="message-detail" aria-label="Message detail">
        {backButton}
        <div className="message-detail-state mail-alert" role="alert">
          <p>{detailErrorMessage(error)}</p>
          <Button onClick={onRetry} size="sm" variant="outline">
            Try again
          </Button>
        </div>
      </section>
    );
  }

  if (!detail) return null;

  return (
    <section className="message-detail" aria-labelledby="message-detail-title">
      {backButton}

      <article className="message-detail-paper">
        <header className="message-detail-header">
          <div className="message-detail-top">
            <div className="message-detail-title-group">
              <h2 id="message-detail-title" ref={headingRef} tabIndex={-1}>
                {detail.subject?.trim() || "(no subject)"}
              </h2>
            </div>
            <Button aria-label="Close message" onClick={onClose} size="icon" variant="ghost">
              <MailIcon name="close" size={18} />
            </Button>
          </div>
          <MessageSenderRow
            actionPending={actionPending}
            allowOriginal={allowOriginal}
            accountId={accountId}
            detail={detail}
            mailboxes={mailboxes}
            offlineAvailable={offlineAvailable}
            offlineSavePending={offlineSavePending}
            offlineSaved={offlineSaved}
            onAction={onAction}
            onForward={onForward}
            onMove={onMove}
            onReply={onReply}
            onToggleOffline={onToggleOffline}
          />
          {actionError ? <p className="mail-alert" role="alert">{actionError}</p> : null}
          {offlineSaveError ? <p className="mail-alert" role="alert">{offlineSaveError}</p> : null}
        </header>

        {readUpdateError ? (
          <p className="read-state-warning" role="status">
            The message is open, but rekad Mail could not mark it as read. It remains unread.
          </p>
        ) : null}

        <MessageBody detail={detail} />
        <MessageAttachments accountId={accountId} attachments={detail.attachments} emailId={detail.id} />
      </article>
    </section>
  );
}
