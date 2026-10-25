"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ComposeDialog } from "./compose-dialog";
import type { ComposeFields } from "./compose-dialog";
import { SignOutButton } from "./sign-out-button";
import { MailIcon, type MailIconName } from "./mail-icons";
import {
  applyOfflineSyncPage,
  clearOtherOfflineAccounts,
  commitOfflineNotificationChanges,
  getOfflineNotificationState,
  getOfflineCache,
  MAX_OFFLINE_MESSAGES,
  OfflineCacheLimitError,
  removeOfflineMessage,
  saveOfflineMessage,
  setOfflineNotificationsEnabled,
  setActiveOfflineScope,
  type OfflineMessageContent,
} from "../lib/offline/mail-cache.mts";

const PAGE_SIZE = 25;
const MAX_ATTACHMENT_DOWNLOAD_BYTES = 4 * 1024 * 1024;

interface Mailbox {
  id: string;
  name: string;
  role: string | null;
  totalEmails: number;
  unreadEmails: number;
}

interface EmailSummary {
  id: string;
  threadId: string;
  from: Array<{ name: string | null; email: string }>;
  subject: string | null;
  receivedAt: string | null;
  preview: string;
  isUnread: boolean;
  isStarred: boolean;
  isDraft: boolean;
}

interface ThreadMessage extends EmailSummary {}

interface ThreadView {
  threadId: string;
  messages: ThreadMessage[];
  truncated: boolean;
}

interface MailListing {
  mailboxes: Mailbox[];
  selectedMailboxId: string;
  position: number;
  pageSize: number;
  total: number | null;
  hasMore: boolean;
  messages: EmailSummary[];
}

interface EmailAddress {
  name: string | null;
  email: string;
}

interface EmailAttachment {
  attachmentIndex: number;
  name: string | null;
  type: string | null;
  size: number | null;
}

interface EmailDetail {
  id: string;
  emailState: string;
  threadId: string;
  from: EmailAddress[];
  replyTo: EmailAddress[];
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  isUnread: boolean;
  isStarred: boolean;
  isDraft: boolean;
  messageId: string[];
  inReplyTo: string[];
  references: string[];
  textBody: string | null;
  htmlBody: string | null;
  externalLinks: string[];
  bodyTruncated: boolean;
  attachments: EmailAttachment[];
  mailboxIds: string[];
}

interface OfflineUpdatedEmail {
  id: string;
  from: EmailAddress[];
  subject: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  textBody: string | null;
  htmlBody: string | null;
}

interface OfflineSyncBody {
  cacheScope: string;
  emailState: string;
  updated: OfflineUpdatedEmail[];
  destroyed: string[];
  hasMore: boolean;
  reset: boolean;
}

interface InboxChangesBody {
  cacheScope: string;
  emailState: string;
  newInboxEmailIds: string[];
  hasMore: boolean;
  hasInboxChanges: boolean;
  reset: boolean;
}

type MailAction = "mark_read" | "mark_unread" | "star" | "unstar" | "move" | "archive" | "trash";

interface ComposeRequest {
  mode: "new" | "reply" | "forward" | "draft";
  draftId?: string;
  fields?: Partial<ComposeFields>;
  headers?: { inReplyTo: string[]; references: string[] };
  trigger: HTMLButtonElement | null;
  label: string;
}

type BodyFormat = "formatted" | "plain";

function senderLabel(email: EmailSummary): string {
  const sender = email.from[0];
  if (!sender) return "Unknown sender";
  const name = sender.name?.trim();
  const address = sender.email.trim();
  return name || address || "Unknown sender";
}

function senderInitials(email: EmailSummary): string {
  const name = senderLabel(email).split("@")[0];
  return name.split(/[\s._-]+/).filter(Boolean).slice(0, 2)
    .map((part) => Array.from(part)[0]).join("").toLocaleUpperCase() || "?";
}

function avatarTone(email: EmailSummary): number {
  return Array.from(senderLabel(email)).reduce((sum, letter) => sum + (letter.codePointAt(0) ?? 0), 0) % 6;
}

function mailboxIcon(role: string | null): MailIconName {
  switch (role) {
    case "inbox": return "inbox";
    case "sent": return "send";
    case "drafts": return "file";
    case "archive": return "archive";
    case "trash": return "trash";
    case "junk": return "mail";
    default: return "folder";
  }
}

async function requestMailAction(
  action: MailAction,
  target: { emailId: string } | { threadId: string },
  destinationMailboxId?: string,
  sourceMailboxId?: string,
): Promise<void> {
  const body: Record<string, string> = { action, ...target };
  if (action === "move" && destinationMailboxId) {
    body.destinationMailboxId = destinationMailboxId;
    if (sourceMailboxId) body.sourceMailboxId = sourceMailboxId;
  }
  const response = await fetch("/api/mail/actions", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.ok) return;
  let reason = "mail_unavailable";
  try {
    const result: unknown = await response.json();
    if (result && typeof result === "object" && "error" in result && typeof result.error === "string") {
      reason = result.error;
    }
  } catch { /* Keep a generic error for non-JSON responses. */ }
  throw new Error(reason);
}

function formatDate(value: string | null): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDetailDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function addressLabel(address: EmailAddress): string {
  const name = address.name?.trim();
  const email = address.email.trim();
  if (name && email) return `${name} <${email}>`;
  return name || email || "Unknown recipient";
}

function formatFileSize(size: number | null): string {
  if (size === null) return "Size unavailable";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
}

function isolatedHtmlDocument(html: string): string {
  const policy =
    "default-src 'none'; script-src 'none'; img-src 'none'; style-src 'none'; font-src 'none'; media-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"></head><body>${html}</body></html>`;
}

async function readEmailDetail(response: Response): Promise<EmailDetail> {
  if (!response.ok) {
    let reason = "mail_unavailable";
    try {
      const body: unknown = await response.json();
      if (
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof body.error === "string"
      ) {
        reason = body.error;
      }
    } catch {
      // Keep the generic service error for non-JSON responses.
    }
    throw new Error(reason);
  }

  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as EmailDetail).id !== "string" ||
    typeof (body as EmailDetail).emailState !== "string" ||
    !Array.isArray((body as EmailDetail).from) ||
    !Array.isArray((body as EmailDetail).replyTo) ||
    !Array.isArray((body as EmailDetail).messageId) ||
    !Array.isArray((body as EmailDetail).references) ||
    !Array.isArray((body as EmailDetail).attachments)
  ) {
    throw new Error("mail_unavailable");
  }
  return body as EmailDetail;
}

function parseOfflineSyncBody(value: unknown, expectedScope: string): OfflineSyncBody | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) return null;
  const body = value as Record<string, unknown>;
  if (
    body.cacheScope !== expectedScope ||
    typeof body.emailState !== "string" ||
    !Array.isArray(body.updated) ||
    body.updated.length > MAX_OFFLINE_MESSAGES ||
    !Array.isArray(body.destroyed) ||
    body.destroyed.length > MAX_OFFLINE_MESSAGES ||
    !body.destroyed.every((id) => typeof id === "string") ||
    typeof body.hasMore !== "boolean" ||
    typeof body.reset !== "boolean"
  ) return null;
  const updated: OfflineUpdatedEmail[] = [];
  for (const item of body.updated) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const email = item as Record<string, unknown>;
    if (
      typeof email.id !== "string" ||
      !Array.isArray(email.from) ||
      typeof email.subject !== "string" && email.subject !== null ||
      typeof email.sentAt !== "string" && email.sentAt !== null ||
      typeof email.receivedAt !== "string" && email.receivedAt !== null ||
      typeof email.textBody !== "string" && email.textBody !== null ||
      typeof email.htmlBody !== "string" && email.htmlBody !== null
    ) return null;
    const from = email.from.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
      const address = candidate as Record<string, unknown>;
      return typeof address.email === "string" &&
        (typeof address.name === "string" || address.name === null)
        ? [{ email: address.email, name: address.name }]
        : [];
    });
    if (from.length !== email.from.length) return null;
    updated.push({
      id: email.id,
      from,
      subject: email.subject,
      sentAt: email.sentAt,
      receivedAt: email.receivedAt,
      textBody: email.textBody,
      htmlBody: email.htmlBody,
    });
  }
  return {
    cacheScope: expectedScope,
    emailState: body.emailState,
    updated,
    destroyed: body.destroyed as string[],
    hasMore: body.hasMore,
    reset: body.reset,
  };
}

function parseInboxChangesBody(value: unknown, expectedScope: string): InboxChangesBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (
    body.cacheScope !== expectedScope ||
    typeof body.emailState !== "string" ||
    !Array.isArray(body.newInboxEmailIds) ||
    body.newInboxEmailIds.length > 100 ||
    !body.newInboxEmailIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 256) ||
    typeof body.hasMore !== "boolean" ||
    typeof body.hasInboxChanges !== "boolean" ||
    typeof body.reset !== "boolean"
  ) return null;
  return body as unknown as InboxChangesBody;
}

async function requestInboxChanges(
  cacheScope: string,
  sinceState: string | null,
  signal?: AbortSignal,
): Promise<InboxChangesBody> {
  const response = await fetch("/api/mail/notifications", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ sinceState }),
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Keep the service error generic.
  }
  if (!response.ok) {
    const error = body && typeof body === "object" && "error" in body &&
        typeof body.error === "string"
      ? body.error
      : "notification_sync_failed";
    throw new Error(error);
  }
  const parsed = parseInboxChangesBody(body, cacheScope);
  if (!parsed) throw new Error("notification_sync_failed");
  return parsed;
}

function textFromSanitizedHtml(html: string): string {
  const documentValue = new DOMParser().parseFromString(html, "text/html");
  for (const element of documentValue.querySelectorAll("script, style, iframe, object, form")) {
    element.remove();
  }
  for (const element of documentValue.querySelectorAll("br")) {
    element.replaceWith(documentValue.createTextNode("\n"));
  }
  for (const element of documentValue.querySelectorAll("p, div, li, blockquote, h1, h2, h3, tr")) {
    element.append(documentValue.createTextNode("\n"));
  }
  return (documentValue.body.textContent ?? "").replace(/\u00a0/g, " ").trim();
}

function offlineContentFromEmail(email: OfflineUpdatedEmail | EmailDetail): OfflineMessageContent {
  const sender = email.from[0];
  const body = email.textBody ?? (email.htmlBody ? textFromSanitizedHtml(email.htmlBody) : "");
  return {
    emailId: email.id,
    subject: email.subject ?? "",
    senderName: sender?.name ?? "",
    senderEmail: sender?.email ?? "",
    receivedAt: email.sentAt ?? email.receivedAt ?? "",
    textBody: body,
  };
}

async function syncOfflineCache(
  cacheScope: string,
  emailIds: string[],
  sinceState: string,
  signal?: AbortSignal,
): Promise<{ emailState: string; hasMore: boolean; destroyed: Set<string> }> {
  let emailState = sinceState;
  const destroyed = new Set<string>();
  let hasMore = false;
  for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
    const response = await fetch("/api/mail/offline-sync", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ sinceState: emailState, emailIds }),
    });
    let responseBody: unknown = null;
    try {
      responseBody = await response.json();
    } catch {
      // Report a generic service failure below.
    }
    if (!response.ok) {
      const error = responseBody && typeof responseBody === "object" &&
          "error" in responseBody && typeof responseBody.error === "string"
        ? responseBody.error
        : "offline_sync_failed";
      throw new Error(error);
    }
    const page = parseOfflineSyncBody(responseBody, cacheScope);
    if (!page) throw new Error("offline_sync_failed");
    const updated = page.updated.map(offlineContentFromEmail);
    await applyOfflineSyncPage(cacheScope, {
      emailState: page.emailState,
      updated,
      destroyed: page.destroyed,
      reset: page.reset,
    });
    for (const emailId of page.destroyed) destroyed.add(emailId);
    emailState = page.emailState;
    hasMore = page.hasMore;
    if (!hasMore) break;
  }
  return { emailState, hasMore, destroyed };
}

function detailErrorMessage(error: string): string {
  if (error === "sign_in_required") {
    return "Your mail session is no longer available. Sign in again to continue.";
  }
  if (error === "message_not_found") {
    return "This message is no longer available in your mailbox.";
  }
  return "This message could not be loaded. Check your connection and try again.";
}

function MessageDetailView({
  detail,
  isLoading,
  isRefreshing,
  error,
  readUpdateError,
  bodyFormat,
  mailboxName,
  backButtonRef,
  headingRef,
  onBack,
  onRetry,
  onBodyFormatChange,
  mailboxes,
  actionPending,
  actionError,
  offlineAvailable,
  offlineSaved,
  offlineSavePending,
  offlineSaveError,
  onAction,
  onMove,
  onReply,
  onForward,
  onToggleOffline,
}: {
  detail: EmailDetail | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  readUpdateError: boolean;
  bodyFormat: BodyFormat;
  mailboxName: string;
  backButtonRef: RefObject<HTMLButtonElement | null>;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onBack(): void;
  onRetry(): void;
  onBodyFormatChange(format: BodyFormat): void;
  mailboxes: Mailbox[];
  actionPending: boolean;
  actionError: string | null;
  offlineAvailable: boolean;
  offlineSaved: boolean;
  offlineSavePending: boolean;
  offlineSaveError: string | null;
  onAction(action: MailAction): void;
  onMove(destinationMailboxId: string): void;
  onReply(detail: EmailDetail, trigger: HTMLButtonElement): void;
  onForward(detail: EmailDetail, trigger: HTMLButtonElement): void;
  onToggleOffline(detail: EmailDetail): void;
}) {
  const backButton = (
    <button
      className="detail-back"
      onClick={onBack}
      ref={backButtonRef}
      type="button"
    >
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
          <button className="inline-retry" onClick={onRetry} type="button">
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (!detail) return null;

  const formattedHtml = Boolean(detail.htmlBody) &&
    (bodyFormat === "formatted" || !detail.textBody);
  const receivedAt = formatDetailDate(detail.receivedAt);
  const sentAt = formatDetailDate(detail.sentAt);

  return (
    <section className="message-detail" aria-labelledby="message-detail-title">
      {backButton}

      <article className="message-detail-paper">
        <header className="message-detail-header">
          <h2 id="message-detail-title" ref={headingRef} tabIndex={-1}>
            {detail.subject?.trim() || "(no subject)"}
          </h2>
          <div className="message-action-bar" role="group" aria-label="Message actions">
            <button
              aria-pressed={offlineSaved}
              disabled={!offlineAvailable || offlineSavePending}
              onClick={() => onToggleOffline(detail)}
              type="button"
            >
              {offlineSavePending
                ? "Saving…"
                : offlineSaved
                  ? "Remove offline copy"
                  : "Save offline"}
            </button>
            <button disabled={actionPending} onClick={() => onAction(detail.isUnread ? "mark_read" : "mark_unread")} type="button">
              {detail.isUnread ? "Mark read" : "Mark unread"}
            </button>
            <button aria-pressed={detail.isStarred} disabled={actionPending} onClick={() => onAction(detail.isStarred ? "unstar" : "star")} type="button">
              {detail.isStarred ? "Unstar" : "Star"}
            </button>
            <button disabled={actionPending} onClick={() => onAction("archive")} type="button">Archive</button>
            <button disabled={actionPending} onClick={() => onAction("trash")} type="button">Trash</button>
            <label className="message-move-control">
              <span className="visually-hidden">Move message to mailbox</span>
              <select
                aria-label="Move message to mailbox"
                defaultValue=""
                disabled={actionPending}
                onChange={(event) => {
                  if (event.target.value) onMove(event.target.value);
                  event.target.value = "";
                }}
              >
                <option value="">Move to…</option>
                {mailboxes.map((mailbox) => (
                  <option key={mailbox.id} value={mailbox.id}>{mailbox.name}</option>
                ))}
              </select>
            </label>
            <button disabled={actionPending} onClick={(event) => onReply(detail, event.currentTarget)} type="button">Reply</button>
            <button disabled={actionPending} onClick={(event) => onForward(detail, event.currentTarget)} type="button">Forward</button>
          </div>
          {actionError ? <p className="mail-alert" role="alert">{actionError}</p> : null}
          {offlineSaveError ? <p className="mail-alert" role="alert">{offlineSaveError}</p> : null}
          {!offlineAvailable ? (
            <p className="attachment-upload-status">Offline storage is not available in this browser.</p>
          ) : null}
          <dl className="message-metadata">
            {detail.from.length > 0 ? (
              <div>
                <dt>From</dt>
                <dd>{detail.from.map(addressLabel).join(", ")}</dd>
              </div>
            ) : null}
            {detail.to.length > 0 ? (
              <div>
                <dt>To</dt>
                <dd>{detail.to.map(addressLabel).join(", ")}</dd>
              </div>
            ) : null}
            {detail.cc.length > 0 ? (
              <div>
                <dt>Cc</dt>
                <dd>{detail.cc.map(addressLabel).join(", ")}</dd>
              </div>
            ) : null}
            {detail.bcc.length > 0 ? (
              <div>
                <dt>Bcc</dt>
                <dd>{detail.bcc.map(addressLabel).join(", ")}</dd>
              </div>
            ) : null}
            {sentAt ? (
              <div>
                <dt>Sent</dt>
                <dd><time dateTime={detail.sentAt ?? undefined}>{sentAt}</time></dd>
              </div>
            ) : null}
            {receivedAt ? (
              <div>
                <dt>Received</dt>
                <dd><time dateTime={detail.receivedAt ?? undefined}>{receivedAt}</time></dd>
              </div>
            ) : null}
          </dl>
        </header>

        {readUpdateError ? (
          <p className="read-state-warning" role="status">
            The message is open, but rekad Mail could not mark it as read. It
            remains unread.
          </p>
        ) : null}

        <section className="message-body-section" aria-label="Message body">
          {detail.htmlBody && detail.textBody ? (
            <div className="body-format-controls" role="group" aria-label="Message format">
              <button
                aria-pressed={bodyFormat === "formatted"}
                className={bodyFormat === "formatted" ? "is-selected" : ""}
                onClick={() => onBodyFormatChange("formatted")}
                type="button"
              >
                Formatted
              </button>
              <button
                aria-pressed={bodyFormat === "plain"}
                className={bodyFormat === "plain" ? "is-selected" : ""}
                onClick={() => onBodyFormatChange("plain")}
                type="button"
              >
                Plain text
              </button>
            </div>
          ) : null}

          {formattedHtml && detail.htmlBody ? (
            <>
              <p className="message-safety-note">
                Images and styling are blocked. Links from the message appear
                separately below.
              </p>
              <iframe
                className="message-html-frame"
                referrerPolicy="no-referrer"
                sandbox=""
                srcDoc={isolatedHtmlDocument(detail.htmlBody)}
                title="Isolated HTML message content"
              />
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
              The message body is shortened to keep this view within a safe
              size limit.
            </p>
          ) : null}
        </section>

        {detail.attachments.length > 0 ? (
          <section className="message-attachments" aria-labelledby="attachment-heading">
            <h3 id="attachment-heading">
              Attachments <span>({detail.attachments.length})</span>
            </h3>
            <ul>
              {detail.attachments.map((attachment) => (
                <li key={`${attachment.attachmentIndex}-${attachment.name ?? "attachment"}`}>
                  <span className="attachment-name" dir="auto">
                    {attachment.name || "Unnamed attachment"}
                  </span>
                  <span className="attachment-details">
                    {attachment.type || "Type unavailable"} · {formatFileSize(attachment.size)}
                  </span>
                  {attachment.size !== null && attachment.size > MAX_ATTACHMENT_DOWNLOAD_BYTES ? (
                    <span className="attachment-over-limit">Over 4 MiB</span>
                  ) : (
                    <a
                      className="attachment-download"
                      download
                      href={`/api/mail/attachments/download?emailId=${encodeURIComponent(detail.id)}&attachmentIndex=${attachment.attachmentIndex}`}
                    >
                      Download
                    </a>
                  )}
                </li>
              ))}
            </ul>
            <p>Files download as attachments. Downloads are limited to 4 MiB per file.</p>
          </section>
        ) : null}

        {detail.externalLinks.length > 0 ? (
          <section className="message-external-links" aria-labelledby="external-links-heading">
            <h3 id="external-links-heading">Links in this message</h3>
            <p>Review the destination before opening a link.</p>
            <ul>
              {detail.externalLinks.map((href) => (
                <li key={href}>
                  <a
                    href={href}
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                    target="_blank"
                  >
                    {href}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </section>
  );
}

async function readListing(response: Response): Promise<MailListing> {
  if (!response.ok) {
    let reason = "mail_unavailable";
    try {
      const body: unknown = await response.json();
      if (
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof body.error === "string"
      ) {
        reason = body.error;
      }
    } catch {
      // Use the generic service error when the response is not JSON.
    }
    throw new Error(reason);
  }

  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== "object" ||
    !Array.isArray((body as MailListing).mailboxes) ||
    !Array.isArray((body as MailListing).messages)
  ) {
    throw new Error("mail_unavailable");
  }
  return body as MailListing;
}

async function readThread(response: Response): Promise<ThreadView> {
  if (!response.ok) {
    let reason = "mail_unavailable";
    try {
      const body: unknown = await response.json();
      const value = body && typeof body === "object" && "error" in body
        ? (body as { error?: unknown }).error
        : null;
      if (typeof value === "string") reason = value;
    } catch {
      // Keep the generic service error for non-JSON responses.
    }
    throw new Error(reason);
  }
  const body: unknown = await response.json();
  if (
    !body || typeof body !== "object" ||
    typeof (body as ThreadView).threadId !== "string" ||
    !Array.isArray((body as ThreadView).messages) ||
    typeof (body as ThreadView).truncated !== "boolean"
  ) throw new Error("mail_unavailable");
  return body as ThreadView;
}

function errorMessage(error: string): string {
  if (error === "sign_in_required") {
    return "Your mail session is no longer available. Sign out, then sign in again.";
  }
  if (error === "mailbox_not_found") {
    return "That mailbox is no longer available. Choose another mailbox.";
  }
  return "Mail could not be loaded. Check your connection and try again.";
}

function mailActionErrorMessage(error: string): string {
  switch (error) {
    case "sign_in_required":
      return "Your mail session has ended. Sign in again before changing mail.";
    case "origin_not_allowed":
      return "The request could not be verified. Reload rekad Mail and try again.";
    case "archive_unavailable":
      return "This account does not have an Archive mailbox, so the message was left unchanged.";
    case "trash_unavailable":
      return "This account does not have a Trash mailbox, so the message was left unchanged.";
    case "thread_too_large":
      return "This conversation is too large for a bulk action. The action was not applied.";
    case "mail_not_found":
      return "That message or mailbox is no longer available. Refresh and try again.";
    default:
      return "That mailbox action could not be saved. The current view will refresh.";
  }
}

export function InboxClient({ accountName, accountEmail }: {
  accountName?: string | null;
  accountEmail?: string | null;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedThreadIds, setSelectedThreadIds] = useState<Set<string>>(() => new Set());
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const pageSelectionRef = useRef<HTMLInputElement | null>(null);
  const [mailboxId, setMailboxId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchScope, setSearchScope] = useState<"all" | "mailbox">("all");
  const [position, setPosition] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [manualRefreshTarget, setManualRefreshTarget] = useState<"list" | "thread" | "message" | null>(null);
  const [listing, setListing] = useState<MailListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [openEmailId, setOpenEmailId] = useState<string | null>(null);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [threadView, setThreadView] = useState<ThreadView | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadRefreshVersion, setThreadRefreshVersion] = useState(0);
  const [emailDetail, setEmailDetail] = useState<EmailDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRefreshVersion, setDetailRefreshVersion] = useState(0);
  const [offlineScope, setOfflineScope] = useState<string | null>(null);
  const [offlineCount, setOfflineCount] = useState(0);
  const [offlineSavedIds, setOfflineSavedIds] = useState<Set<string>>(() => new Set());
  const [offlineReady, setOfflineReady] = useState(false);
  const [offlineStatus, setOfflineStatus] = useState("Preparing offline copies…");
  const [offlineSavePendingId, setOfflineSavePendingId] = useState<string | null>(null);
  const [offlineSaveError, setOfflineSaveError] = useState<string | null>(null);
  const [notificationsReady, setNotificationsReady] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsSupported] = useState(
    () => typeof window !== "undefined" && "Notification" in window,
  );
  const [notificationStatus, setNotificationStatus] = useState<string | null>(null);
  const offlineSyncPending = useRef(false);
  const notificationPollRef = useRef<(() => void) | null>(null);
  const [bodyFormat, setBodyFormat] = useState<BodyFormat>("formatted");
  const [readUpdateError, setReadUpdateError] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isComposeMinimized, setIsComposeMinimized] = useState(false);
  const [composeInstance, setComposeInstance] = useState(0);
  const [pendingComposeRequest, setPendingComposeRequest] = useState<ComposeRequest | null>(null);
  const [composeMode, setComposeMode] = useState<"new" | "reply" | "forward" | "draft">("new");
  const [composeDraftId, setComposeDraftId] = useState<string | undefined>();
  const [composeSeed, setComposeSeed] = useState<Partial<ComposeFields> | undefined>();
  const [composeReplyHeaders, setComposeReplyHeaders] = useState<{ inReplyTo: string[]; references: string[] } | undefined>();
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const skipMailboxFetch = useRef<string | null>(null);
  const composeButtonRef = useRef<HTMLButtonElement | null>(null);
  const composeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mailTitleRef = useRef<HTMLHeadingElement | null>(null);
  const detailBackButtonRef = useRef<HTMLButtonElement | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const threadBackButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastOpenedMessageIdRef = useRef<string | null>(null);
  const restoreMessageFocus = useRef(false);
  const lastOpenedThreadIdRef = useRef<string | null>(null);
  const restoreThreadFocus = useRef(false);

  useEffect(() => {
    let active = true;
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        if (active) setOfflineStatus("Offline copies are ready, but the offline page could not be installed.");
      });
    } else {
      setOfflineStatus("Offline copies are available, but this browser does not support an offline page.");
    }

    async function prepareOfflineStorage() {
      try {
        const response = await fetch("/api/mail/offline-scope", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        const body: unknown = await response.json();
        const scope = body && typeof body === "object" && "cacheScope" in body
          ? (body as { cacheScope?: unknown }).cacheScope
          : null;
        if (!response.ok || typeof scope !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(scope)) {
          throw new Error("Offline storage could not be prepared.");
        }
        await clearOtherOfflineAccounts(scope);
        setActiveOfflineScope(scope);
        const cache = await getOfflineCache(scope);
        const notificationState = await getOfflineNotificationState(scope);
        if (!active) return;
        setOfflineScope(scope);
        setOfflineCount(cache.messages.length);
        setOfflineSavedIds(new Set(cache.messages.map((message) => message.emailId)));
        setOfflineReady(true);
        setNotificationsEnabled(notificationState?.enabled ?? false);
        setNotificationsReady(true);
        setOfflineStatus(cache.messages.length === 0
          ? "Choose Save offline on a message to keep a copy on this device."
          : `${cache.messages.length} offline ${cache.messages.length === 1 ? "copy" : "copies"} on this device.`);
      } catch {
        if (!active) return;
        setOfflineReady(false);
        setOfflineStatus("Offline storage is unavailable. Sign in online and try again.");
      }
    }

    void prepareOfflineStorage();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = searchInput.trim();
      if (normalized !== searchText) {
        setPosition(0);
        setListing(null);
        setSearchText(normalized);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput, searchText]);

  useEffect(() => {
    if (!offlineReady || !offlineScope) return;
    let active = true;
    let running = false;
    const controller = new AbortController();

    async function synchronizeSavedCopies() {
      if (!navigator.onLine || running || controller.signal.aborted) return;
      running = true;
      try {
        const cache = await getOfflineCache(offlineScope!);
        if (!cache.account || cache.messages.length === 0) return;
        const result = await syncOfflineCache(
          offlineScope!,
          cache.messages.map((message) => message.emailId),
          cache.account.emailState,
          controller.signal,
        );
        const updatedCache = await getOfflineCache(offlineScope!);
        if (!active) return;
        setOfflineCount(updatedCache.messages.length);
        setOfflineSavedIds(new Set(updatedCache.messages.map((message) => message.emailId)));
        setOfflineStatus(result.hasMore
          ? "Some offline copies still need updates. Refresh to continue."
          : `Offline copies synced · ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
      } catch {
        if (!active || controller.signal.aborted) return;
        setOfflineStatus("Offline copies could not sync. They remain available on this device.");
      } finally {
        running = false;
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void synchronizeSavedCopies();
    };
    window.addEventListener("online", synchronizeSavedCopies);
    document.addEventListener("visibilitychange", onVisible);
    void synchronizeSavedCopies();
    return () => {
      active = false;
      controller.abort();
      window.removeEventListener("online", synchronizeSavedCopies);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [offlineReady, offlineScope, refreshVersion]);

  useEffect(() => {
    if (!notificationsReady || !offlineScope) return;
    let active = true;
    let running = false;
    const controller = new AbortController();

    async function pollInboxChanges() {
      if (
        running ||
        !navigator.onLine ||
        document.visibilityState !== "visible" ||
        controller.signal.aborted
      ) return;
      running = true;
      try {
        const state = await getOfflineNotificationState(offlineScope!);
        let sinceState = state?.emailState || null;
        for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
          const page = await requestInboxChanges(offlineScope!, sinceState, controller.signal);
          const committed = await commitOfflineNotificationChanges(
            offlineScope!,
            sinceState,
            page.emailState,
            page.newInboxEmailIds,
          );
          if (!committed.committed) break;
          if (!active) return;
          if (page.hasInboxChanges) setRefreshVersion((value) => value + 1);
          if (
            notificationsSupported &&
            committed.enabled &&
            committed.notifyEmailIds.length > 0 &&
            Notification.permission === "granted"
          ) {
            const count = committed.notifyEmailIds.length;
            try {
              new Notification("New mail", {
                body: count === 1 ? "A new message arrived." : `${count} new messages arrived.`,
                tag: `rekad-new-mail-${Date.now()}`,
              });
            } catch {
              // Polling and list refresh continue when the browser blocks a notification.
            }
          }
          sinceState = page.emailState;
          if (!page.hasMore) break;
        }
        if (active) setNotificationStatus(null);
      } catch {
        if (active && !controller.signal.aborted) {
          setNotificationStatus("New mail checks are temporarily unavailable. Use Refresh to retry.");
        }
      } finally {
        running = false;
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void pollInboxChanges();
    };
    notificationPollRef.current = () => void pollInboxChanges();
    window.addEventListener("online", pollInboxChanges);
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => void pollInboxChanges(), 60_000);
    void pollInboxChanges();
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("online", pollInboxChanges);
      document.removeEventListener("visibilitychange", onVisible);
      if (notificationPollRef.current) notificationPollRef.current = null;
    };
  }, [notificationsReady, notificationsSupported, offlineScope]);

  useEffect(() => {
    if (mailboxId && skipMailboxFetch.current === mailboxId) {
      skipMailboxFetch.current = null;
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ position: String(position) });
    if (mailboxId) params.set("mailboxId", mailboxId);
    if (searchText) {
      params.set("q", searchText);
      params.set("searchScope", searchScope);
    }

    async function loadMail() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/mail?${params.toString()}`, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        const nextListing = await readListing(response);
        if (controller.signal.aborted) return;
        setListing(nextListing);
        if (!mailboxId) {
          skipMailboxFetch.current = nextListing.selectedMailboxId;
          setMailboxId(nextListing.selectedMailboxId);
        }
      } catch (loadError) {
        if (controller.signal.aborted) return;
        const reason =
          loadError instanceof Error ? loadError.message : "mail_unavailable";
        setError(reason);
        if (reason === "mailbox_not_found") {
          setListing(null);
          setMailboxId(null);
          setPosition(0);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setManualRefreshTarget((target) => target === "list" ? null : target);
        }
      }
    }

    void loadMail();
    return () => controller.abort();
  }, [mailboxId, position, refreshVersion, searchText, searchScope]);

  useEffect(() => {
    if (!openThreadId) return;
    const threadId = openThreadId;
    const controller = new AbortController();
    async function loadThread() {
      setThreadLoading(true);
      setThreadError(null);
      try {
        const query = new URLSearchParams({ threadId });
        const response = await fetch(`/api/mail/thread?${query.toString()}`, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        const nextThread = await readThread(response);
        if (controller.signal.aborted) return;
        setThreadView(nextThread);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setThreadError(loadError instanceof Error ? loadError.message : "mail_unavailable");
        setThreadView(null);
      } finally {
        if (!controller.signal.aborted) {
          setThreadLoading(false);
          setManualRefreshTarget((target) => target === "thread" ? null : target);
        }
      }
    }
    void loadThread();
    return () => controller.abort();
  }, [openThreadId, threadRefreshVersion]);

  useEffect(() => {
    if (!openEmailId) return;
    const emailId = openEmailId;

    const controller = new AbortController();
    async function loadMessage() {
      let readUpdateAttempted = false;
      setDetailLoading(true);
      setDetailError(null);
      setReadUpdateError(false);
      setEmailDetail(null);
      setBodyFormat("formatted");

      try {
        const query = new URLSearchParams({ emailId });
        const response = await fetch(`/api/mail/detail?${query.toString()}`, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        const nextDetail = await readEmailDetail(response);
        if (controller.signal.aborted) return;
        setEmailDetail(nextDetail);
        setDetailLoading(false);

        if (nextDetail.isUnread) {
          readUpdateAttempted = true;
          let readResponse: Response;
          try {
            readResponse = await fetch(
              `/api/mail/detail?${query.toString()}`,
              {
                method: "POST",
                credentials: "same-origin",
                cache: "no-store",
                headers: {
                  accept: "application/json",
                  "content-type": "application/json",
                },
                body: "{}",
              },
            );
          } catch {
            throw new Error("read_state_update_failed");
          }
          if (!readResponse.ok) throw new Error("read_state_update_failed");

          setEmailDetail((current) =>
            current?.id === emailId ? { ...current, isUnread: false } : current,
          );
          setListing((current) => {
            if (!current) return current;
            const wasUnread = current.messages.some(
              (message) => message.id === emailId && message.isUnread,
            );
            if (!wasUnread) return current;

            const affectedMailboxIds = new Set([
              current.selectedMailboxId,
              ...nextDetail.mailboxIds,
            ]);
            return {
              ...current,
              messages: current.messages.map((message) =>
                message.id === emailId
                  ? { ...message, isUnread: false }
                  : message,
              ),
              mailboxes: current.mailboxes.map((mailbox) =>
                affectedMailboxIds.has(mailbox.id)
                  ? {
                      ...mailbox,
                      unreadEmails: Math.max(0, mailbox.unreadEmails - 1),
                    }
                  : mailbox,
              ),
            };
          });
        }
      } catch (loadError) {
        if (controller.signal.aborted) {
          if (readUpdateAttempted) {
            setRefreshVersion((value) => value + 1);
          }
          return;
        }
        if (
          loadError instanceof Error &&
          loadError.message === "read_state_update_failed"
        ) {
          setReadUpdateError(true);
          setRefreshVersion((value) => value + 1);
        } else {
          setDetailError(
            loadError instanceof Error ? loadError.message : "mail_unavailable",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
          setManualRefreshTarget((target) => target === "message" ? null : target);
        }
      }
    }

    void loadMessage();
    return () => controller.abort();
  }, [openEmailId, detailRefreshVersion]);

  useEffect(() => {
    if (openEmailId) {
      detailBackButtonRef.current?.focus();
      return;
    }
    if (openThreadId && !restoreMessageFocus.current) {
      threadBackButtonRef.current?.focus();
      return;
    }
    if (restoreMessageFocus.current) {
      restoreMessageFocus.current = false;
      const messageId = lastOpenedMessageIdRef.current;
      lastOpenedMessageIdRef.current = null;
      if (!messageId) return;
      const messageButton = Array.from(
        document.querySelectorAll<HTMLButtonElement>("[data-email-id]"),
      ).find((button) => button.dataset.emailId === messageId);
      messageButton?.focus();
      return;
    }
    if (openThreadId || !restoreThreadFocus.current) return;

    restoreThreadFocus.current = false;
    const threadId = lastOpenedThreadIdRef.current;
    lastOpenedThreadIdRef.current = null;
    if (!threadId) return;
    const messageButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-thread-id]"),
    ).find((button) => button.dataset.threadId === threadId);
    messageButton?.focus();
  }, [openEmailId, openThreadId]);

  useEffect(() => {
    if (emailDetail?.id === openEmailId) {
      detailHeadingRef.current?.focus();
    }
  }, [emailDetail?.id, openEmailId]);

  useEffect(() => {
    function focusSearch(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && (!isComposeOpen || isComposeMinimized)) {
        event.preventDefault();
        setSidebarCollapsed(false);
        window.requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [isComposeOpen, isComposeMinimized]);

  useEffect(() => {
    setSelectedThreadIds(new Set());
  }, [mailboxId, position, searchText, searchScope]);

  useEffect(() => {
    if (!pageSelectionRef.current) return;
    const selectable = listing?.messages.filter((message) => !message.isDraft) ?? [];
    const selectedCount = selectable.filter((message) => selectedThreadIds.has(message.threadId)).length;
    pageSelectionRef.current.indeterminate = selectedCount > 0 && selectedCount < selectable.length;
  }, [listing, selectedThreadIds]);

  const selectedMailbox = listing?.mailboxes.find(
    (mailbox) => mailbox.id === listing.selectedMailboxId,
  );
  const firstResult = listing?.messages.length ? position + 1 : 0;
  const lastResult = position + (listing?.messages.length ?? 0);
  const resultRange = listing
    ? listing.messages.length === 0
      ? listing.total === 0
        ? "0 conversations"
        : "No conversations on this page"
      : listing.total === null
        ? `${firstResult}–${lastResult} conversations`
        : `${firstResult}–${lastResult} of ${listing.total} conversations`
    : "";

  function refresh() {
    setManualRefreshTarget(openEmailId ? "message" : openThreadId ? "thread" : "list");
    notificationPollRef.current?.();
    if (openEmailId) {
      setDetailRefreshVersion((value) => value + 1);
      setRefreshVersion((value) => value + 1);
      if (openThreadId) setThreadRefreshVersion((value) => value + 1);
      return;
    }
    if (openThreadId) {
      setThreadRefreshVersion((value) => value + 1);
      setRefreshVersion((value) => value + 1);
      return;
    }
    setError(null);
    if (position !== 0) {
      setListing(null);
      setPosition(0);
    } else {
      setRefreshVersion((value) => value + 1);
    }
  }

  function selectMailbox(nextMailboxId: string) {
    if (nextMailboxId === mailboxId) return;
    setManualRefreshTarget(null);
    restoreMessageFocus.current = false;
    setListing(null);
    setError(null);
    setActionError(null);
    setPosition(0);
    setMailboxId(nextMailboxId);
    setOpenEmailId(null);
    setOpenThreadId(null);
    setThreadView(null);
    setEmailDetail(null);
  }

  async function performMailAction(
    action: MailAction,
    target: { emailId: string } | { threadId: string },
    destinationMailboxId?: string,
  ) {
    if (actionPending) return;
    setActionPending(true);
    setActionError(null);
    try {
      await requestMailAction(action, target, destinationMailboxId, listing?.selectedMailboxId);
      if (action === "mark_unread" && "emailId" in target && target.emailId === openEmailId) {
        closeMessage();
      }
      setRefreshVersion((value) => value + 1);
      if (openThreadId) setThreadRefreshVersion((value) => value + 1);
      if (openEmailId && action !== "mark_unread") {
        setDetailRefreshVersion((value) => value + 1);
      }
    } catch (error) {
      setActionError(mailActionErrorMessage(
        error instanceof Error ? error.message : "mail_unavailable",
      ));
      setRefreshVersion((value) => value + 1);
      if (openThreadId) setThreadRefreshVersion((value) => value + 1);
    } finally {
      setActionPending(false);
    }
  }

  async function performSelectedMailAction(action: MailAction, destinationMailboxId?: string) {
    const targets = listing?.messages.filter((message) =>
      !message.isDraft && selectedThreadIds.has(message.threadId)) ?? [];
    if (actionPending || targets.length === 0) return;
    setActionPending(true);
    setActionError(null);
    const completed = new Set<string>();
    try {
      for (const message of targets) {
        await requestMailAction(action, { threadId: message.threadId }, destinationMailboxId, listing?.selectedMailboxId);
        completed.add(message.threadId);
      }
    } catch (error) {
      const reason = mailActionErrorMessage(error instanceof Error ? error.message : "mail_unavailable");
      setActionError(completed.size > 0
        ? `${completed.size} conversations were updated before the action stopped. ${reason}`
        : reason);
    } finally {
      setSelectedThreadIds((current) => new Set([...current].filter((id) => !completed.has(id))));
      setRefreshVersion((value) => value + 1);
      setActionPending(false);
    }
  }

  function startComposeRequest(request: ComposeRequest) {
    composeTriggerRef.current = request.trigger;
    setComposeMode(request.mode);
    setComposeDraftId(request.draftId);
    setComposeSeed(request.fields);
    setComposeReplyHeaders(request.headers);
    setPendingComposeRequest(null);
    setIsComposeMinimized(false);
    setComposeInstance((value) => value + 1);
    setIsComposeOpen(true);
  }

  function openCompose(
    mode: "new" | "reply" | "forward",
    seed?: Partial<ComposeFields>,
    headers?: { inReplyTo: string[]; references: string[] },
    trigger?: HTMLButtonElement | null,
  ) {
    if (isComposeOpen && mode === "new") {
      setIsComposeMinimized(false);
      return;
    }
    const subject = seed?.subject?.trim();
    const request: ComposeRequest = {
      mode, fields: seed, headers, trigger: trigger ?? composeButtonRef.current,
      label: mode === "reply" ? `Reply${subject ? ` to “${subject}”` : " to the selected message"}`
        : mode === "forward" ? `Forward${subject ? ` “${subject}”` : " the selected message"}` : "New message",
    };
    if (isComposeOpen) {
      setPendingComposeRequest(request);
      setIsComposeMinimized(false);
      return;
    }
    startComposeRequest(request);
  }

  function replyToMessage(detail: EmailDetail, trigger?: HTMLButtonElement) {
    const targets = detail.replyTo.length > 0 ? detail.replyTo : detail.from;
    const subject = detail.subject?.trim() ?? "";
    const replySubject = /^re:/i.test(subject) ? subject : subject ? `Re: ${subject}` : "";
    const originalId = detail.messageId[detail.messageId.length - 1] ??
      detail.inReplyTo[detail.inReplyTo.length - 1];
    const references = Array.from(new Set([
      ...detail.references,
      ...(originalId ? [originalId] : []),
    ])).slice(-50);
    const quote = (detail.textBody ?? "").split("\n").map((line) => `> ${line}`).join("\n");
    const date = formatDetailDate(detail.sentAt ?? detail.receivedAt) ?? "the previous message";
    const author = detail.from[0] ? addressLabel(detail.from[0]) : "the sender";
    openCompose("reply", {
      to: targets.map((address) => address.email).join(", "),
      subject: replySubject,
      body: `\n\nOn ${date}, ${author} wrote:\n${quote}`,
    }, {
      inReplyTo: originalId ? [originalId] : [],
      references,
    }, trigger);
  }

  function forwardMessage(detail: EmailDetail, trigger?: HTMLButtonElement) {
    const subject = detail.subject?.trim() ?? "";
    const forwardSubject = /^fwd:/i.test(subject) ? subject : subject ? `Fwd: ${subject}` : "";
    const headerLines = [
      "---------- Forwarded message ----------",
      `From: ${detail.from.map(addressLabel).join(", ") || "Unknown sender"}`,
      `Date: ${formatDetailDate(detail.sentAt ?? detail.receivedAt) ?? "Date unavailable"}`,
      `Subject: ${subject || "(no subject)"}`,
      `To: ${detail.to.map(addressLabel).join(", ") || "Unknown recipient"}`,
    ];
    if (detail.cc.length > 0) headerLines.push(`Cc: ${detail.cc.map(addressLabel).join(", ")}`);
    openCompose("forward", {
      subject: forwardSubject,
      body: `\n\n${headerLines.join("\n")}\n\n${detail.textBody ?? ""}`,
    }, { inReplyTo: [], references: [] }, trigger);
  }

  function changePage(nextPosition: number) {
    setManualRefreshTarget(null);
    setListing(null);
    setError(null);
    setPosition(nextPosition);
  }

  function selectSentMailbox() {
    setManualRefreshTarget(null);
    const sentMailbox = listing?.mailboxes.find((mailbox) => mailbox.role === "sent");
    if (!sentMailbox) return;
    setListing(null);
    setError(null);
    setActionError(null);
    setPosition(0);
    setSearchInput("");
    setSearchText("");
    setSearchScope("mailbox");
    setMailboxId(sentMailbox.id);
    setRefreshVersion((value) => value + 1);
    setOpenThreadId(null);
    setOpenEmailId(null);
    setThreadView(null);
    setEmailDetail(null);
  }

  function closeMessage() {
    setManualRefreshTarget(null);
    restoreMessageFocus.current = true;
    setOpenEmailId(null);
    setEmailDetail(null);
    setDetailError(null);
    setReadUpdateError(false);
  }

  function openMessage(emailId: string) {
    setManualRefreshTarget(null);
    restoreMessageFocus.current = true;
    setActionError(null);
    setOfflineSaveError(null);
    lastOpenedMessageIdRef.current = emailId;
    setDetailLoading(true);
    setDetailError(null);
    setReadUpdateError(false);
    setOpenEmailId(emailId);
  }

  function openThread(threadId: string) {
    setManualRefreshTarget(null);
    restoreMessageFocus.current = false;
    restoreThreadFocus.current = true;
    lastOpenedThreadIdRef.current = threadId;
    setOpenEmailId(null);
    setActionError(null);
    setEmailDetail(null);
    setOpenThreadId(threadId);
    setThreadView(null);
    setThreadError(null);
  }

  function closeThread() {
    setManualRefreshTarget(null);
    setOpenEmailId(null);
    setEmailDetail(null);
    setOpenThreadId(null);
    setThreadView(null);
    setThreadError(null);
    setActionError(null);
    restoreThreadFocus.current = true;
    setRefreshVersion((value) => value + 1);
  }

  function openSavedDraft(draftId: string, trigger?: HTMLButtonElement | null, subject?: string | null) {
    if (isComposeOpen && composeDraftId === draftId) {
      setIsComposeMinimized(false);
      return;
    }
    const request: ComposeRequest = {
      mode: "draft", draftId, trigger: trigger ?? composeButtonRef.current,
      label: subject?.trim() ? `Saved draft “${subject.trim()}”` : "The selected saved draft",
    };
    if (isComposeOpen) {
      setPendingComposeRequest(request);
      setIsComposeMinimized(false);
      return;
    }
    startComposeRequest(request);
  }

  async function toggleOfflineCopy(detail: EmailDetail): Promise<void> {
    if (!offlineReady || !offlineScope || offlineSavePendingId) return;
    setOfflineSavePendingId(detail.id);
    setOfflineSaveError(null);
    let successMessage: string | null = null;
    try {
      const cache = await getOfflineCache(offlineScope);
      if (offlineSavedIds.has(detail.id)) {
        await removeOfflineMessage(offlineScope, detail.id);
      } else {
        let emailIds = cache.messages.map((message) => message.emailId);
        if (!emailIds.includes(detail.id)) emailIds.push(detail.id);
        if (emailIds.length > MAX_OFFLINE_MESSAGES) {
          const oldest = [...cache.messages]
            .sort((left, right) => left.lastAccessAt - right.lastAccessAt)[0];
          if (oldest) emailIds = emailIds.filter((emailId) => emailId !== oldest.emailId);
        }
        if (navigator.onLine) {
          const synced = await syncOfflineCache(
            offlineScope,
            emailIds,
            cache.account?.emailState ?? detail.emailState,
          );
          if (synced.destroyed.has(detail.id)) {
            throw new Error("message_not_found");
          }
        }
        const updatedCache = await getOfflineCache(offlineScope);
        const latest = updatedCache.messages.find((message) => message.emailId === detail.id);
        const content = latest
          ? {
              emailId: latest.emailId,
              subject: latest.subject,
              senderName: latest.senderName,
              senderEmail: latest.senderEmail,
              receivedAt: latest.receivedAt,
              textBody: latest.textBody,
            }
          : offlineContentFromEmail(detail);
        const saved = await saveOfflineMessage(
          offlineScope,
          content,
          updatedCache.account?.emailState ?? detail.emailState,
        );
        if (saved.evictedEmailIds.length > 0) {
          successMessage = "Saved offline. The oldest offline copy was removed to stay within the device limit.";
        }
      }
      const nextCache = await getOfflineCache(offlineScope);
      setOfflineCount(nextCache.messages.length);
      setOfflineSavedIds(new Set(nextCache.messages.map((message) => message.emailId)));
      setOfflineStatus(successMessage ?? (offlineSavedIds.has(detail.id)
        ? "Offline copy removed from this device."
        : "Saved on this device. It will sync when you are online."));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "offline_save_failed";
      setOfflineSaveError(reason === "message_not_found"
        ? "This message is no longer available to save."
        : error instanceof OfflineCacheLimitError
          ? "This message is too large for the offline storage limit."
          : "The offline copy could not be saved. Check storage space and try again.");
    } finally {
      setOfflineSavePendingId(null);
    }
  }

  async function toggleNewMailNotifications(): Promise<void> {
    if (!offlineScope || !notificationsReady) return;
    setNotificationStatus(null);
    try {
      if (notificationsEnabled) {
        await setOfflineNotificationsEnabled(offlineScope, false);
        setNotificationsEnabled(false);
        setNotificationStatus("New mail alerts are off for this account.");
        return;
      }
      if (!notificationsSupported) {
        setNotificationStatus("This browser does not support notifications.");
        return;
      }
      let permission = Notification.permission;
      if (permission === "default") {
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted") {
        setNotificationStatus(permission === "denied"
          ? "Notifications are blocked in browser settings."
          : "Notifications were not enabled.");
        return;
      }
      await setOfflineNotificationsEnabled(offlineScope, true);
      setNotificationsEnabled(true);
      setNotificationStatus("New mail alerts are on for this account.");
    } catch {
      setNotificationStatus("The notification preference could not be saved.");
    }
  }

  function closeComposeDialog() {
    setIsComposeOpen(false);
    setIsComposeMinimized(false);
    setPendingComposeRequest(null);
    setComposeDraftId(undefined);
    setComposeSeed(undefined);
    setComposeReplyHeaders(undefined);
    setRefreshVersion((value) => value + 1);
  }

  const selectableMessages = listing?.messages.filter((message) => !message.isDraft) ?? [];
  const selectedCount = selectableMessages.filter((message) => selectedThreadIds.has(message.threadId)).length;
  const allPageSelected = selectableMessages.length > 0 && selectedCount === selectableMessages.length;
  const displayAccount = accountName?.trim() || accountEmail?.trim() || "rekad account";
  const accountInitial = Array.from(displayAccount)[0]?.toLocaleUpperCase() || "r";
  const archiveAvailable = Boolean(listing?.mailboxes.some((mailbox) => mailbox.role === "archive"));
  const trashAvailable = Boolean(listing?.mailboxes.some((mailbox) => mailbox.role === "trash"));
  const currentViewLoading = openEmailId ? detailLoading : openThreadId ? threadLoading : isLoading;
  const refreshLabel = currentViewLoading
    ? openEmailId ? manualRefreshTarget === "message" ? "Refreshing message…" : "Opening message…"
      : openThreadId ? manualRefreshTarget === "thread" ? "Refreshing conversation…" : "Opening conversation…"
        : manualRefreshTarget === "list" || listing ? "Refreshing messages…" : "Loading messages…"
    : openEmailId ? "Refresh message" : openThreadId ? "Refresh conversation" : "Refresh messages";
  const listStatus = isLoading
    ? listing ? "Refreshing messages…" : "Loading conversations…"
    : selectedCount > 0 ? `${selectedCount} selected` : listing ? resultRange : "";

  function renderMailbox(mailbox: Mailbox) {
    const isSelected = mailbox.id === listing?.selectedMailboxId;
    return (
      <button aria-pressed={isSelected} className={`mailbox-link${isSelected ? " is-selected" : ""}`}
        key={mailbox.id} onClick={() => selectMailbox(mailbox.id)} type="button" title={mailbox.name}>
        <MailIcon name={mailboxIcon(mailbox.role)} />
        <span className="mailbox-name">{mailbox.name}</span>
        {mailbox.unreadEmails > 0 ? <span className="mailbox-unread"><span className="visually-hidden">unread: </span>{mailbox.unreadEmails.toLocaleString()}</span> : null}
      </button>
    );
  }

  return (
    <main className={`mail-shell${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
      <aside className="mail-sidebar" aria-label="Mail navigation">
        <div className="sidebar-brand-row">
          <a className="mail-brand" href="/" aria-label="rekad Mail home">
            <span className="brand-mark"><MailIcon name="mail" size={24} /></span>
            <span className="brand-name">rekad Mail</span>
          </a>
          <button className="icon-button sidebar-collapse" type="button"
            aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed((value) => !value)}>
            <MailIcon name="sidebar" size={19} />
          </button>
        </div>

        <div className="sidebar-search">
          <div className="sidebar-search-input">
            <label className="visually-hidden" htmlFor="mail-search">Search mail</label>
            <MailIcon name="search" size={17} />
            <input autoComplete="off" id="mail-search" ref={searchInputRef}
              onChange={(event) => setSearchInput(event.target.value)} placeholder="Search..."
              type="search" value={searchInput} aria-keyshortcuts="Control+k Meta+k" />
            <kbd aria-hidden="true">Ctrl / ⌘ K</kbd>
          </div>
          <label className="search-scope-label" htmlFor="mail-search-scope">Search in
            <select id="mail-search-scope" onChange={(event) => {
              setSearchScope(event.target.value as "all" | "mailbox");
              setPosition(0); setListing(null);
            }} value={searchScope}>
              <option value="all">All mail</option><option value="mailbox">Current mailbox</option>
            </select>
          </label>
        </div>

        <nav className="mailbox-nav" aria-label="Mailboxes">
          {listing?.mailboxes.filter((mailbox) => mailbox.role !== null).map(renderMailbox)}
          {!listing && isLoading ? <p className="sidebar-note">Loading mailboxes…</p> : null}
          {listing?.mailboxes.some((mailbox) => mailbox.role === null) ? (
            <><p className="sidebar-section-label">Folders</p>{listing.mailboxes.filter((mailbox) => mailbox.role === null).map(renderMailbox)}</>
          ) : null}
        </nav>

        <div className="sidebar-tools">
          <a className="sidebar-tool-link" href="/offline.html" title="Offline copies">
            <MailIcon name="offline" /><span>Offline copies</span><span className="tool-count">{offlineCount}</span>
          </a>
          <p className="offline-copy-status" role="status">{offlineStatus}</p>
          {notificationsSupported ? (
            <button aria-pressed={notificationsEnabled} className="sidebar-tool-link notification-toggle"
              disabled={!notificationsReady} onClick={() => void toggleNewMailNotifications()} type="button"
              title={notificationsEnabled ? "Turn off new mail alerts" : "Enable new mail alerts"}>
              <MailIcon name="bell" /><span>{!notificationsReady ? "Preparing alerts…" : notificationsEnabled ? "Mail alerts on" : "Enable mail alerts"}</span>
            </button>
          ) : <p className="notification-status">Browser notifications are not available.</p>}
          {notificationStatus ? <p className="notification-status" role="status">{notificationStatus}</p> : null}
        </div>
        <div className="sidebar-footer">
          <span className="account-avatar" aria-hidden="true">{accountInitial}</span>
          <span className="sidebar-account-copy"><strong>{displayAccount}</strong><span>{accountEmail || "Signed in to rekad Mail"}</span></span>
        </div>
      </aside>

      <section className="mail-content" aria-labelledby="mail-title">
        <header className="mail-header">
          <div className="mail-header-navigation">
            <nav className="pagination" aria-label="Message pages">
              <button aria-label={openEmailId ? "Back to conversation" : openThreadId ? "Back to messages" : "Previous page"}
                className="page-button" disabled={(!openEmailId && !openThreadId && position === 0) || isLoading || actionPending}
                onClick={() => openEmailId ? closeMessage() : openThreadId ? closeThread() : changePage(Math.max(0, position - PAGE_SIZE))} type="button"><MailIcon name="chevron-left" size={17} /></button>
              <button aria-label="Next page" className="page-button"
                disabled={Boolean(openEmailId || openThreadId || !listing?.hasMore || isLoading || actionPending)}
                onClick={() => changePage(position + PAGE_SIZE)} type="button"><MailIcon name="chevron-right" size={17} /></button>
            </nav>
            <div className="mail-breadcrumb"><span>rekad Mail</span><MailIcon name="chevron-right" size={14} />
              <h1 id="mail-title" ref={mailTitleRef} tabIndex={-1}>{openEmailId ? "Reading message" : openThreadId ? "Conversation" : searchText ? "Search results" : selectedMailbox?.name ?? "Inbox"}</h1>
            </div>
          </div>
          <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
            {!openEmailId && !openThreadId ? listStatus : ""}
          </span>
          <div className="mail-header-account">
            <button className="icon-button refresh-button" disabled={currentViewLoading} aria-busy={currentViewLoading}
              onClick={refresh} type="button" aria-label={refreshLabel}
              title={refreshLabel}><MailIcon name="refresh" size={18} /></button>
            <button className="icon-button header-notification" disabled={!notificationsSupported || !notificationsReady}
              aria-label={notificationsEnabled ? "Turn off new mail alerts" : "Enable new mail alerts"}
              aria-pressed={notificationsEnabled} onClick={() => void toggleNewMailNotifications()} type="button"
              title={!notificationsSupported ? "Browser notifications are unavailable" : notificationsEnabled ? "New mail alerts are enabled" : "Enable new mail alerts"}>
              <MailIcon name="bell" size={18} />
            </button>
            <span className="header-divider" />
            <details className="account-menu">
              <summary className="account-trigger"><span>{displayAccount}</span><MailIcon name="chevron-down" size={14} /></summary>
              <div className="account-menu-popover"><p>{accountEmail || "Signed in to rekad Mail"}</p><SignOutButton /></div>
            </details>
          </div>
        </header>

        {!openEmailId && !openThreadId ? (
          <div className="message-toolbar" aria-label="Message list controls">
            <div className="bulk-toolbar">
              <label className="page-select" title="Select conversations on this page">
                <input aria-label="Select all conversations on this page" checked={allPageSelected}
                  disabled={isLoading || actionPending || selectableMessages.length === 0} ref={pageSelectionRef} type="checkbox"
                  onChange={(event) => setSelectedThreadIds(event.target.checked ? new Set(selectableMessages.map((message) => message.threadId)) : new Set())} />
                <span className="visually-hidden">{selectedCount} selected</span>
              </label>
              <div className="bulk-action-group" role="group" aria-label="Selected conversation actions">
                <button className="toolbar-action" disabled={selectedCount === 0 || actionPending || !archiveAvailable}
                  onClick={() => void performSelectedMailAction("archive")} title={archiveAvailable ? "Archive selected conversations" : "This account has no Archive mailbox"} type="button"><MailIcon name="archive" size={19} /><span>Archive</span></button>
                <label className={`toolbar-action toolbar-folder${selectedCount === 0 || actionPending ? " is-disabled" : ""}`}>
                  <MailIcon name="folder" size={19} /><span>Folder</span>
                  <select aria-label="Move selected conversations to mailbox" value="" disabled={selectedCount === 0 || actionPending}
                    onChange={(event) => { if (event.target.value) void performSelectedMailAction("move", event.target.value); }}>
                    <option value="">Move to folder</option>{listing?.mailboxes.map((mailbox) => <option key={mailbox.id} value={mailbox.id}>{mailbox.name}</option>)}
                  </select>
                </label>
                <button className="toolbar-action" disabled={selectedCount === 0 || actionPending || !trashAvailable}
                  onClick={() => void performSelectedMailAction("trash")} title="Move selected conversations to Trash" type="button"><MailIcon name="trash" size={19} /><span>Delete</span></button>
                <details className="selection-menu">
                  <summary className="icon-button" aria-label="More selected conversation actions"><MailIcon name="more" size={19} /></summary>
                  <div className="selection-menu-popover">
                    {([['mark_read', 'Mark read'], ['mark_unread', 'Mark unread'], ['star', 'Star'], ['unstar', 'Unstar']] as const).map(([action, label]) => (
                      <button key={action} disabled={selectedCount === 0 || actionPending} onClick={() => void performSelectedMailAction(action)} type="button">{label}</button>
                    ))}
                  </div>
                </details>
              </div>
            </div>
            <div className="message-toolbar-actions">
              <p className="result-count">{listStatus}</p>
              <button className="compose-launch-button" disabled={!listing || isLoading}
                onClick={(event) => openCompose("new", undefined, undefined, event.currentTarget)} ref={composeButtonRef}
                type="button" aria-label={isComposeOpen ? "Restore open message" : "Compose new message"}><MailIcon name="plus" size={20} />{isComposeOpen ? "Restore Message" : "Write Message"}</button>
            </div>
          </div>
        ) : null}

        {!openEmailId && !openThreadId && error ? (
          <div className="mail-alert" role="alert">
            <p>{errorMessage(error)}</p>
            {error !== "sign_in_required" ? (
              <button className="inline-retry" onClick={refresh} type="button">
                Try again
              </button>
            ) : null}
          </div>
        ) : null}

        {!openEmailId && !openThreadId && !listing && isLoading ? (
          <div className="mail-state">
            <span className="loading-indicator" aria-hidden="true" />
            <p>Loading your mail…</p>
          </div>
        ) : null}

        {!openEmailId && !openThreadId && !listing && !isLoading && !error ? (
          <div className="mail-state">
            <p>Mail is unavailable right now.</p>
            <button className="inline-retry" onClick={refresh} type="button">
              Try again
            </button>
          </div>
        ) : null}

        {!openEmailId && !openThreadId && listing && listing.messages.length === 0 && !isLoading && !error ? (
          <div className="empty-state">
            <span className="empty-envelope" aria-hidden="true">
              <svg viewBox="0 0 32 24" focusable="false">
                <path d="M2.5 3.5h27v17h-27zM3 4l13 10L29 4" />
              </svg>
            </span>
            <h2>{searchText ? "No conversations found" : position === 0 ? "This mailbox is empty" : "No conversations on this page"}</h2>
            <p>
              {searchText
                ? "Try another search or change the search scope."
                : position === 0
                ? "New messages will appear here."
                : "Go to the previous page or refresh to check again."}
            </p>
          </div>
        ) : null}

        {!openEmailId && !openThreadId && listing && listing.messages.length > 0 ? (
          <ol className={`message-list${isLoading ? " is-loading" : ""}`} aria-label="Conversations">
            {listing.messages.map((message) => (
              <li className={`conversation-list-item${selectedThreadIds.has(message.threadId) ? " is-selected" : ""}`} key={message.threadId}>
                <label className="conversation-select">
                  <input aria-label={`Select conversation from ${senderLabel(message)}: ${message.subject?.trim() || "(no subject)"}`}
                    checked={selectedThreadIds.has(message.threadId)} disabled={message.isDraft || actionPending || isLoading}
                    title={message.isDraft ? "Open this draft to edit it" : undefined} type="checkbox"
                    onChange={(event) => setSelectedThreadIds((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(message.threadId); else next.delete(message.threadId);
                      return next;
                    })} />
                </label>
                <button type="button" className={`message-row${message.isUnread ? " is-unread" : ""}`} disabled={actionPending}
                  data-email-id={message.id} data-thread-id={message.threadId}
                  aria-label={`${message.isDraft ? "Edit saved draft" : `Open ${message.isUnread ? "unread" : "read"} conversation`}${message.isStarred ? ", starred" : ""} from ${senderLabel(message)}: ${message.subject?.trim() || "(no subject)"}`}
                  onClick={(event) => message.isDraft ? openSavedDraft(message.id, event.currentTarget, message.subject) : openThread(message.threadId)}>
                  <span className={`message-avatar avatar-tone-${avatarTone(message)}`} aria-hidden="true">{senderInitials(message)}</span>
                  <span className="message-sender">{senderLabel(message)}{message.isStarred ? <span className="conversation-star" aria-hidden="true"> ★</span> : null}</span>
                  <span className="message-copy"><span className="message-subject">{message.isDraft ? <em>Draft: </em> : null}{message.subject?.trim() || "(no subject)"}</span><span className="message-preview"> — {message.preview}</span></span>
                  <time className="message-date" dateTime={message.receivedAt ?? undefined}>{formatDate(message.receivedAt)}</time>
                </button>
                {!message.isDraft ? (
                  <details className="conversation-row-menu">
                    <summary className="icon-button" aria-label={`Actions for conversation from ${senderLabel(message)}`}><MailIcon name="more" size={18} /></summary>
                    <div className="conversation-row-actions" role="group" aria-label="Conversation actions">
                      <button disabled={actionPending} onClick={() => void performMailAction(message.isUnread ? "mark_read" : "mark_unread", { threadId: message.threadId })} type="button">{message.isUnread ? "Mark read" : "Mark unread"}</button>
                      <button disabled={actionPending} onClick={() => void performMailAction(message.isStarred ? "unstar" : "star", { threadId: message.threadId })} type="button">{message.isStarred ? "Unstar" : "Star"}</button>
                      <select aria-label="Move conversation to mailbox" defaultValue="" disabled={actionPending} onChange={(event) => {
                        const destinationId = event.target.value;
                        if (destinationId) void performMailAction("move", { threadId: message.threadId }, destinationId);
                        event.target.value = "";
                      }}><option value="">Move to…</option>{listing.mailboxes.map((mailbox) => <option key={mailbox.id} value={mailbox.id}>{mailbox.name}</option>)}</select>
                      <button disabled={actionPending || !archiveAvailable} onClick={() => void performMailAction("archive", { threadId: message.threadId })} type="button">Archive</button>
                      <button disabled={actionPending || !trashAvailable} onClick={() => void performMailAction("trash", { threadId: message.threadId })} type="button">Move to Trash</button>
                    </div>
                  </details>
                ) : <span />}
              </li>
            ))}
          </ol>
        ) : null}

        {openThreadId && !openEmailId ? (
          <section className="thread-view" aria-label="Conversation">
            <button className="detail-back" onClick={closeThread} ref={threadBackButtonRef} type="button">
              <span aria-hidden="true">←</span>
              Back to {selectedMailbox?.name ?? "mail"}
            </button>
            {threadLoading ? (
              <div className="mail-state" role="status" aria-live="polite">
                <span className="loading-indicator" aria-hidden="true" />
                <p>{manualRefreshTarget === "thread" ? "Refreshing conversation…" : "Opening conversation…"}</p>
              </div>
            ) : null}
            {threadError ? (
              <div className="mail-alert" role="alert">
                <p>This conversation could not be loaded.</p>
                <button className="inline-retry" onClick={() => setThreadRefreshVersion((value) => value + 1)} type="button">Try again</button>
              </div>
            ) : null}
            {actionError ? <p className="mail-alert" role="alert">{actionError}</p> : null}
            {threadView && !threadLoading ? (
              <>
                <header className="thread-header">
                  <div>
                    <p className="eyebrow">Conversation · {threadView.messages.length}{threadView.truncated ? "+" : ""} messages</p>
                    <h2>{threadView.messages[threadView.messages.length - 1]?.subject?.trim() || "(no subject)"}</h2>
                  </div>
                  <div className="thread-actions" role="group" aria-label="Conversation actions">
                    <button disabled={actionPending || threadView.truncated} onClick={() => void performMailAction(threadView.messages.some((message) => message.isUnread) ? "mark_read" : "mark_unread", { threadId: openThreadId })} type="button">
                      {threadView.messages.some((message) => message.isUnread) ? "Mark all read" : "Mark all unread"}
                    </button>
                    <button disabled={actionPending || threadView.truncated} onClick={() => void performMailAction(threadView.messages.some((message) => message.isStarred) ? "unstar" : "star", { threadId: openThreadId })} type="button">
                      {threadView.messages.some((message) => message.isStarred) ? "Unstar all" : "Star all"}
                    </button>
                    <label>
                      <span className="visually-hidden">Move conversation to mailbox</span>
                      <select
                        aria-label="Move conversation to mailbox"
                        defaultValue=""
                        disabled={actionPending || threadView.truncated}
                        onChange={(event) => {
                          const destinationId = event.target.value;
                          if (destinationId) void performMailAction("move", { threadId: openThreadId }, destinationId);
                          event.target.value = "";
                        }}
                      >
                        <option value="">Move to…</option>
                        {(listing?.mailboxes ?? []).map((mailbox) => <option key={mailbox.id} value={mailbox.id}>{mailbox.name}</option>)}
                      </select>
                    </label>
                    <button disabled={actionPending || threadView.truncated} onClick={() => void performMailAction("archive", { threadId: openThreadId })} type="button">Archive</button>
                    <button disabled={actionPending || threadView.truncated} onClick={() => void performMailAction("trash", { threadId: openThreadId })} type="button">Trash</button>
                    {threadView.messages.some((message) => !message.isDraft) ? (
                      <button
                        disabled={actionPending}
                        onClick={() => {
                          const latestMessage = [...threadView.messages]
                            .reverse()
                            .find((message) => !message.isDraft);
                          if (latestMessage) openMessage(latestMessage.id);
                        }}
                        type="button"
                      >
                        Reply
                      </button>
                    ) : null}
                  </div>
                </header>
                {threadView.truncated ? (
                  <p className="thread-truncated-note" role="status">Showing the latest 100 messages. Bulk conversation actions are unavailable; message actions still work for the messages shown.</p>
                ) : null}
                <ol className="thread-message-list" aria-label="Messages in this conversation">
                  {threadView.messages.map((message) => (
                    <li className="thread-message-card" key={message.id}>
                      <button
                        className={`thread-message-open${message.isUnread ? " is-unread" : ""}`}
                        data-email-id={message.id}
                        aria-label={`${message.isDraft ? "Edit saved draft" : `Open ${message.isUnread ? "unread" : "read"} message`}${message.isStarred ? ", starred" : ""} from ${senderLabel(message)}: ${message.subject?.trim() || "(no subject)"}`}
                        onClick={(event) => message.isDraft
                          ? openSavedDraft(message.id, event.currentTarget, message.subject)
                          : openMessage(message.id)}
                        type="button"
                      >
                        <span className="message-state-dot" aria-hidden="true" />
                        <span className="message-copy">
                          <span className="message-sender">{senderLabel(message)}</span>
                          <span className="message-subject">{message.subject?.trim() || "(no subject)"}{message.isStarred ? " ★" : ""}</span>
                          <span className="message-preview">{message.preview}</span>
                        </span>
                        <time className="message-date" dateTime={message.receivedAt ?? undefined}>{formatDate(message.receivedAt)}</time>
                      </button>
                      {!message.isDraft ? (
                        <div className="thread-message-actions" role="group" aria-label={`Actions for message from ${senderLabel(message)}`}>
                          <button disabled={actionPending} onClick={() => void performMailAction(message.isUnread ? "mark_read" : "mark_unread", { emailId: message.id })} type="button">{message.isUnread ? "Mark read" : "Mark unread"}</button>
                          <button aria-pressed={message.isStarred} disabled={actionPending} onClick={() => void performMailAction(message.isStarred ? "unstar" : "star", { emailId: message.id })} type="button">{message.isStarred ? "Unstar" : "Star"}</button>
                          <label>
                            <span className="visually-hidden">Move this message to mailbox</span>
                            <select
                              aria-label="Move this message to mailbox"
                              defaultValue=""
                              disabled={actionPending}
                              onChange={(event) => {
                                const destinationId = event.target.value;
                                if (destinationId) void performMailAction("move", { emailId: message.id }, destinationId);
                                event.target.value = "";
                              }}
                            >
                              <option value="">Move to…</option>
                              {(listing?.mailboxes ?? []).map((mailbox) => <option key={mailbox.id} value={mailbox.id}>{mailbox.name}</option>)}
                            </select>
                          </label>
                          <button disabled={actionPending} onClick={() => void performMailAction("archive", { emailId: message.id })} type="button">Archive</button>
                          <button disabled={actionPending} onClick={() => void performMailAction("trash", { emailId: message.id })} type="button">Trash</button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
          </section>
        ) : null}

        {openEmailId ? (
          <MessageDetailView
            bodyFormat={bodyFormat}
            backButtonRef={detailBackButtonRef}
            headingRef={detailHeadingRef}
            detail={emailDetail}
            error={detailError}
            isLoading={detailLoading}
            isRefreshing={manualRefreshTarget === "message"}
            mailboxName="conversation"
            onBack={closeMessage}
            onBodyFormatChange={setBodyFormat}
            onRetry={refresh}
            readUpdateError={readUpdateError}
            mailboxes={listing?.mailboxes ?? []}
            actionPending={actionPending}
            actionError={actionError}
            offlineAvailable={offlineReady && Boolean(offlineScope)}
            offlineSaved={Boolean(emailDetail && offlineSavedIds.has(emailDetail.id))}
            offlineSavePending={Boolean(emailDetail && offlineSavePendingId === emailDetail.id)}
            offlineSaveError={offlineSaveError}
            onAction={(action) => void performMailAction(action, { emailId: openEmailId })}
            onMove={(destinationId) => void performMailAction("move", { emailId: openEmailId }, destinationId)}
            onReply={(detail, trigger) => replyToMessage(detail, trigger)}
            onForward={(detail, trigger) => forwardMessage(detail, trigger)}
            onToggleOffline={(detail) => void toggleOfflineCopy(detail)}
          />
        ) : null}

        {!openEmailId && !openThreadId && actionError ? (
          <p className="mail-alert" role="alert">{actionError}</p>
        ) : null}

        {!openEmailId && !openThreadId && listing && error ? (
          <p className="stale-list-note">Showing the last successfully loaded page.</p>
        ) : null}
      </section>
      {isComposeOpen ? (
        <ComposeDialog
          key={composeInstance}
          pendingRequestLabel={pendingComposeRequest?.label ?? null}
          onCancelSwitch={() => setPendingComposeRequest(null)}
          onConfirmSwitch={() => { if (pendingComposeRequest) startComposeRequest(pendingComposeRequest); }}
          isMinimized={isComposeMinimized}
          onMinimizedChange={setIsComposeMinimized}
          fallbackFocusRef={mailTitleRef}
          onClose={closeComposeDialog}
          onInspectSent={() => {
            closeComposeDialog();
            selectSentMailbox();
          }}
          onSubmitted={selectSentMailbox}
          triggerRef={composeTriggerRef}
          mode={composeMode}
          initialDraftId={composeDraftId}
          initialFields={composeSeed}
          initialReplyHeaders={composeReplyHeaders}
        />
      ) : null}
    </main>
  );
}
