"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ComposeDialog } from "./compose-dialog";
import type { ComposeFields } from "./compose-dialog";
import { SignOutButton } from "./sign-out-button";

const PAGE_SIZE = 25;

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
  name: string | null;
  type: string | null;
  size: number | null;
}

interface EmailDetail {
  id: string;
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

type MailAction = "mark_read" | "mark_unread" | "star" | "unstar" | "move" | "archive" | "trash";

type BodyFormat = "formatted" | "plain";

function senderLabel(email: EmailSummary): string {
  const sender = email.from[0];
  if (!sender) return "Unknown sender";
  const name = sender.name?.trim();
  const address = sender.email.trim();
  return name || address || "Unknown sender";
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
  onAction,
  onMove,
  onReply,
  onForward,
}: {
  detail: EmailDetail | null;
  isLoading: boolean;
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
  onAction(action: MailAction): void;
  onMove(destinationMailboxId: string): void;
  onReply(detail: EmailDetail): void;
  onForward(detail: EmailDetail): void;
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
          <p>Opening message…</p>
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
            <button disabled={actionPending} onClick={() => onReply(detail)} type="button">Reply</button>
            <button disabled={actionPending} onClick={() => onForward(detail)} type="button">Forward</button>
          </div>
          {actionError ? <p className="mail-alert" role="alert">{actionError}</p> : null}
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
              {detail.attachments.map((attachment, index) => (
                <li key={`${attachment.name ?? "attachment"}-${index}`}>
                  <span className="attachment-name">
                    {attachment.name || "Unnamed attachment"}
                  </span>
                  <span className="attachment-details">
                    {attachment.type || "Type unavailable"} · {formatFileSize(attachment.size)}
                  </span>
                </li>
              ))}
            </ul>
            <p>Attachment downloads are not available yet.</p>
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

export function InboxClient() {
  const [mailboxId, setMailboxId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchScope, setSearchScope] = useState<"all" | "mailbox">("all");
  const [position, setPosition] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
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
  const [bodyFormat, setBodyFormat] = useState<BodyFormat>("formatted");
  const [readUpdateError, setReadUpdateError] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<"new" | "reply" | "forward" | "draft">("new");
  const [composeDraftId, setComposeDraftId] = useState<string | undefined>();
  const [composeSeed, setComposeSeed] = useState<Partial<ComposeFields> | undefined>();
  const [composeReplyHeaders, setComposeReplyHeaders] = useState<{ inReplyTo: string[]; references: string[] } | undefined>();
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const skipMailboxFetch = useRef<string | null>(null);
  const composeButtonRef = useRef<HTMLButtonElement | null>(null);
  const mailTitleRef = useRef<HTMLHeadingElement | null>(null);
  const detailBackButtonRef = useRef<HTMLButtonElement | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const threadBackButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastOpenedMessageIdRef = useRef<string | null>(null);
  const restoreMessageFocus = useRef(false);
  const lastOpenedThreadIdRef = useRef<string | null>(null);
  const restoreThreadFocus = useRef(false);

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
        if (!controller.signal.aborted) setIsLoading(false);
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
        if (!controller.signal.aborted) setThreadLoading(false);
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
        if (!controller.signal.aborted) setDetailLoading(false);
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
    const body: Record<string, string> = { action, ...target };
    if (action === "move" && destinationMailboxId) {
      body.destinationMailboxId = destinationMailboxId;
      if (listing?.selectedMailboxId) {
        body.sourceMailboxId = listing.selectedMailboxId;
      }
    }
    try {
      const response = await fetch("/api/mail/actions", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        let reason = "mail_unavailable";
        try {
          const responseBody: unknown = await response.json();
          const value = responseBody && typeof responseBody === "object" && "error" in responseBody
            ? (responseBody as { error?: unknown }).error
            : null;
          if (typeof value === "string") reason = value;
        } catch {
          // Keep the generic failure for non-JSON responses.
        }
        throw new Error(reason);
      }
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

  function openCompose(mode: "new" | "reply" | "forward", seed?: Partial<ComposeFields>, headers?: { inReplyTo: string[]; references: string[] }) {
    setComposeMode(mode);
    setComposeDraftId(undefined);
    setComposeSeed(seed);
    setComposeReplyHeaders(headers);
    setIsComposeOpen(true);
  }

  function replyToMessage(detail: EmailDetail) {
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
    });
  }

  function forwardMessage(detail: EmailDetail) {
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
    }, { inReplyTo: [], references: [] });
  }

  function changePage(nextPosition: number) {
    setListing(null);
    setError(null);
    setPosition(nextPosition);
  }

  function selectSentMailbox() {
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
    restoreMessageFocus.current = true;
    setOpenEmailId(null);
    setEmailDetail(null);
    setDetailError(null);
    setReadUpdateError(false);
  }

  function openMessage(emailId: string) {
    restoreMessageFocus.current = true;
    setActionError(null);
    lastOpenedMessageIdRef.current = emailId;
    setDetailLoading(true);
    setDetailError(null);
    setReadUpdateError(false);
    setOpenEmailId(emailId);
  }

  function openThread(threadId: string) {
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
    setOpenEmailId(null);
    setEmailDetail(null);
    setOpenThreadId(null);
    setThreadView(null);
    setThreadError(null);
    setActionError(null);
    restoreThreadFocus.current = true;
    setRefreshVersion((value) => value + 1);
  }

  function openSavedDraft(draftId: string) {
    setComposeMode("draft");
    setComposeDraftId(draftId);
    setComposeSeed(undefined);
    setComposeReplyHeaders(undefined);
    setIsComposeOpen(true);
  }

  function closeComposeDialog() {
    setIsComposeOpen(false);
    setComposeDraftId(undefined);
    setComposeSeed(undefined);
    setComposeReplyHeaders(undefined);
    setRefreshVersion((value) => value + 1);
  }

  return (
    <main className="mail-shell">
      <aside className="mail-sidebar" aria-label="Mail navigation">
        <a className="mail-brand" href="/" aria-label="rekad Mail home">
          <span className="brand-mark" aria-hidden="true">
            r
          </span>
          <span>rekad Mail</span>
        </a>

        <nav className="mailbox-nav" aria-label="Mailboxes">
          {listing?.mailboxes.map((mailbox) => {
            const isSelected = mailbox.id === listing.selectedMailboxId;
            return (
              <button
                aria-pressed={isSelected}
                className={`mailbox-link${isSelected ? " is-selected" : ""}`}
                key={mailbox.id}
                onClick={() => selectMailbox(mailbox.id)}
                type="button"
              >
                <span className="mailbox-name">{mailbox.name}</span>
                {mailbox.unreadEmails > 0 ? (
                  <span className="mailbox-unread">
                    <span className="visually-hidden">unread: </span>
                    {mailbox.unreadEmails.toLocaleString()}
                  </span>
                ) : null}
              </button>
            );
          })}
          {!listing && isLoading ? (
            <p className="sidebar-note">Loading mailboxes…</p>
          ) : null}
        </nav>

        <div className="sidebar-footer">
          <SignOutButton />
        </div>
      </aside>

      <section className="mail-content" aria-labelledby="mail-title">
        <header className="mail-header">
          <div>
            <p className="eyebrow">Your mailbox</p>
            <h1 id="mail-title" ref={mailTitleRef} tabIndex={-1}>
              {openEmailId ? "Reading message" : openThreadId ? "Conversation" : selectedMailbox?.name ?? "Inbox"}
            </h1>
          </div>
          <button
            className="refresh-button"
            disabled={openEmailId ? detailLoading : openThreadId ? threadLoading : isLoading}
            onClick={refresh}
            type="button"
            aria-label={openEmailId ? "Refresh message" : openThreadId ? "Refresh conversation" : "Refresh messages"}
          >
            <span className="refresh-icon" aria-hidden="true">
              ↻
            </span>
            {(openEmailId ? detailLoading : openThreadId ? threadLoading : isLoading) && listing
              ? "Refreshing…"
              : "Refresh"}
          </button>
        </header>

        {!openEmailId && !openThreadId ? (
          <div className="message-toolbar" aria-label="Message list controls">
            <div className="mail-search-controls">
              <label htmlFor="mail-search">Search mail</label>
              <input
                autoComplete="off"
                id="mail-search"
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search all mail"
                type="search"
                value={searchInput}
              />
              <label className="visually-hidden" htmlFor="mail-search-scope">Search scope</label>
              <select
                id="mail-search-scope"
                onChange={(event) => {
                  setSearchScope(event.target.value as "all" | "mailbox");
                  setPosition(0);
                  setListing(null);
                }}
                value={searchScope}
              >
                <option value="all">All mail</option>
                <option value="mailbox">Current mailbox</option>
              </select>
            </div>
            <p className="result-count" aria-live="polite">
              {listing ? resultRange : isLoading ? "Loading conversations…" : ""}
            </p>
            <div className="message-toolbar-actions">
              <button
                className="compose-launch-button"
                disabled={!listing || isLoading}
                onClick={() => openCompose("new")}
                ref={composeButtonRef}
                type="button"
              >
                <span aria-hidden="true">＋</span>
                Compose
              </button>
              {listing ? (
                <nav className="pagination" aria-label="Message pages">
                  <button
                    aria-label="Previous page"
                    className="page-button"
                    disabled={position === 0 || isLoading}
                    onClick={() => changePage(Math.max(0, position - PAGE_SIZE))}
                    type="button"
                  >
                    <span aria-hidden="true">←</span>
                  </button>
                  <button
                    aria-label="Next page"
                    className="page-button"
                    disabled={!listing.hasMore || isLoading}
                    onClick={() => changePage(position + PAGE_SIZE)}
                    type="button"
                  >
                    <span aria-hidden="true">→</span>
                  </button>
                </nav>
              ) : null}
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
          <div className="mail-state" role="status" aria-live="polite">
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
              <li className="conversation-list-item" key={message.threadId}>
                <button
                  type="button"
                  className={`message-row${message.isUnread ? " is-unread" : ""}`}
                  data-email-id={message.id}
                  data-thread-id={message.threadId}
                  aria-label={`Open ${message.isUnread ? "unread" : "read"} conversation from ${senderLabel(message)}: ${message.subject?.trim() || "(no subject)"}`}
                  onClick={() => message.isDraft ? openSavedDraft(message.id) : openThread(message.threadId)}
                >
                  <span className="message-state-dot" aria-hidden="true" />
                  <span className="message-copy">
                    <span className="message-sender">{senderLabel(message)}{message.isStarred ? <span className="conversation-star" aria-label="Starred"> ★</span> : null}</span>
                    <span className="message-subject">
                      {message.isDraft ? "Draft: " : ""}{message.subject?.trim() || "(no subject)"}
                    </span>
                    <span className="message-preview">{message.preview}</span>
                  </span>
                  <time
                    className="message-date"
                    dateTime={message.receivedAt ?? undefined}
                  >
                    {formatDate(message.receivedAt)}
                  </time>
                </button>
                {!message.isDraft ? (
                  <div className="conversation-row-actions" role="group" aria-label="Conversation actions">
                    <label>
                      <span className="visually-hidden">Move conversation to mailbox</span>
                      <select
                        aria-label="Move conversation to mailbox"
                        defaultValue=""
                        disabled={actionPending}
                        onChange={(event) => {
                          const destinationId = event.target.value;
                          if (destinationId) void performMailAction("move", { threadId: message.threadId }, destinationId);
                          event.target.value = "";
                        }}
                      >
                        <option value="">Move to…</option>
                        {listing.mailboxes.map((mailbox) => <option key={mailbox.id} value={mailbox.id}>{mailbox.name}</option>)}
                      </select>
                    </label>
                    <button disabled={actionPending} onClick={() => void performMailAction("archive", { threadId: message.threadId })} type="button">Archive</button>
                    <button disabled={actionPending} onClick={() => void performMailAction("trash", { threadId: message.threadId })} type="button">Trash</button>
                  </div>
                ) : null}
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
                <p>Opening conversation…</p>
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
                        aria-label={`${message.isDraft ? "Edit saved draft" : "Open message"} from ${senderLabel(message)}: ${message.subject?.trim() || "(no subject)"}`}
                        onClick={() => message.isDraft ? openSavedDraft(message.id) : openMessage(message.id)}
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
            mailboxName="conversation"
            onBack={closeMessage}
            onBodyFormatChange={setBodyFormat}
            onRetry={refresh}
            readUpdateError={readUpdateError}
            mailboxes={listing?.mailboxes ?? []}
            actionPending={actionPending}
            actionError={actionError}
            onAction={(action) => void performMailAction(action, { emailId: openEmailId })}
            onMove={(destinationId) => void performMailAction("move", { emailId: openEmailId }, destinationId)}
            onReply={replyToMessage}
            onForward={forwardMessage}
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
          fallbackFocusRef={mailTitleRef}
          onClose={closeComposeDialog}
          onInspectSent={() => {
            closeComposeDialog();
            selectSentMailbox();
          }}
          onSubmitted={selectSentMailbox}
          triggerRef={composeButtonRef}
          mode={composeMode}
          initialDraftId={composeDraftId}
          initialFields={composeSeed}
          initialReplyHeaders={composeReplyHeaders}
        />
      ) : null}
    </main>
  );
}
