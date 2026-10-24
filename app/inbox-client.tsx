"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
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
  from: Array<{ name: string | null; email: string }>;
  subject: string | null;
  receivedAt: string | null;
  preview: string;
  isUnread: boolean;
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
  from: EmailAddress[];
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  isUnread: boolean;
  textBody: string | null;
  htmlBody: string | null;
  externalLinks: string[];
  bodyTruncated: boolean;
  attachments: EmailAttachment[];
  mailboxIds: string[];
}

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

function errorMessage(error: string): string {
  if (error === "sign_in_required") {
    return "Your mail session is no longer available. Sign out, then sign in again.";
  }
  if (error === "mailbox_not_found") {
    return "That mailbox is no longer available. Choose another mailbox.";
  }
  return "Mail could not be loaded. Check your connection and try again.";
}

export function InboxClient() {
  const [mailboxId, setMailboxId] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [listing, setListing] = useState<MailListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [openEmailId, setOpenEmailId] = useState<string | null>(null);
  const [emailDetail, setEmailDetail] = useState<EmailDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRefreshVersion, setDetailRefreshVersion] = useState(0);
  const [bodyFormat, setBodyFormat] = useState<BodyFormat>("formatted");
  const [readUpdateError, setReadUpdateError] = useState(false);
  const skipMailboxFetch = useRef<string | null>(null);
  const detailBackButtonRef = useRef<HTMLButtonElement | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const lastOpenedMessageIdRef = useRef<string | null>(null);
  const restoreMessageFocus = useRef(false);

  useEffect(() => {
    if (mailboxId && skipMailboxFetch.current === mailboxId) {
      skipMailboxFetch.current = null;
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ position: String(position) });
    if (mailboxId) params.set("mailboxId", mailboxId);

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
  }, [mailboxId, position, refreshVersion]);

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
    if (!restoreMessageFocus.current) return;

    restoreMessageFocus.current = false;
    const messageId = lastOpenedMessageIdRef.current;
    lastOpenedMessageIdRef.current = null;
    if (!messageId) return;

    const messageButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".message-row"),
    ).find((button) => button.dataset.emailId === messageId);
    messageButton?.focus();
  }, [openEmailId]);

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
        ? "0 messages"
        : "No messages on this page"
      : listing.total === null
        ? `${firstResult}–${lastResult}`
        : `${firstResult}–${lastResult} of ${listing.total}`
    : "";

  function refresh() {
    if (openEmailId) {
      setDetailRefreshVersion((value) => value + 1);
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
    setPosition(0);
    setMailboxId(nextMailboxId);
    setOpenEmailId(null);
    setEmailDetail(null);
  }

  function changePage(nextPosition: number) {
    setListing(null);
    setError(null);
    setPosition(nextPosition);
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
    lastOpenedMessageIdRef.current = emailId;
    setDetailLoading(true);
    setDetailError(null);
    setReadUpdateError(false);
    setOpenEmailId(emailId);
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
            <h1 id="mail-title">
              {openEmailId ? "Reading message" : selectedMailbox?.name ?? "Inbox"}
            </h1>
          </div>
          <button
            className="refresh-button"
            disabled={openEmailId ? detailLoading : isLoading}
            onClick={refresh}
            type="button"
            aria-label={openEmailId ? "Refresh message" : "Refresh messages"}
          >
            <span className="refresh-icon" aria-hidden="true">
              ↻
            </span>
            {(openEmailId ? detailLoading : isLoading) && listing
              ? "Refreshing…"
              : "Refresh"}
          </button>
        </header>

        {!openEmailId ? (
          <div className="message-toolbar" aria-label="Message list controls">
          <p className="result-count" aria-live="polite">
            {listing ? resultRange : isLoading ? "Loading messages…" : ""}
          </p>
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
        ) : null}

        {!openEmailId && error ? (
          <div className="mail-alert" role="alert">
            <p>{errorMessage(error)}</p>
            {error !== "sign_in_required" ? (
              <button className="inline-retry" onClick={refresh} type="button">
                Try again
              </button>
            ) : null}
          </div>
        ) : null}

        {!openEmailId && !listing && isLoading ? (
          <div className="mail-state" role="status" aria-live="polite">
            <span className="loading-indicator" aria-hidden="true" />
            <p>Loading your mail…</p>
          </div>
        ) : null}

        {!openEmailId && !listing && !isLoading && !error ? (
          <div className="mail-state">
            <p>Mail is unavailable right now.</p>
            <button className="inline-retry" onClick={refresh} type="button">
              Try again
            </button>
          </div>
        ) : null}

        {!openEmailId && listing && listing.messages.length === 0 && !isLoading && !error ? (
          <div className="empty-state">
            <span className="empty-envelope" aria-hidden="true">
              <svg viewBox="0 0 32 24" focusable="false">
                <path d="M2.5 3.5h27v17h-27zM3 4l13 10L29 4" />
              </svg>
            </span>
            <h2>
              {position === 0 ? "This mailbox is empty" : "No messages on this page"}
            </h2>
            <p>
              {position === 0
                ? "New messages will appear here."
                : "Go to the previous page or refresh to check again."}
            </p>
          </div>
        ) : null}

        {!openEmailId && listing && listing.messages.length > 0 ? (
          <ol className={`message-list${isLoading ? " is-loading" : ""}`} aria-label="Messages">
            {listing.messages.map((message) => (
              <li key={message.id}>
                <button
                  type="button"
                  className={`message-row${message.isUnread ? " is-unread" : ""}`}
                  data-email-id={message.id}
                  aria-label={`Open ${message.isUnread ? "unread" : "read"} message from ${senderLabel(message)}: ${message.subject?.trim() || "(no subject)"}`}
                  onClick={() => openMessage(message.id)}
                >
                  <span className="message-state-dot" aria-hidden="true" />
                  <span className="message-copy">
                    <span className="message-sender">{senderLabel(message)}</span>
                    <span className="message-subject">
                      {message.subject?.trim() || "(no subject)"}
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
              </li>
            ))}
          </ol>
        ) : null}

        {openEmailId ? (
          <MessageDetailView
            bodyFormat={bodyFormat}
            backButtonRef={detailBackButtonRef}
            headingRef={detailHeadingRef}
            detail={emailDetail}
            error={detailError}
            isLoading={detailLoading}
            mailboxName={selectedMailbox?.name ?? "messages"}
            onBack={closeMessage}
            onBodyFormatChange={setBodyFormat}
            onRetry={refresh}
            readUpdateError={readUpdateError}
          />
        ) : null}

        {!openEmailId && listing && error ? (
          <p className="stale-list-note">Showing the last successfully loaded page.</p>
        ) : null}
      </section>
    </main>
  );
}
