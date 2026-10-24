"use client";

import { useEffect, useRef, useState } from "react";
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
  const skipMailboxFetch = useRef<string | null>(null);

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
    setListing(null);
    setError(null);
    setPosition(0);
    setMailboxId(nextMailboxId);
  }

  function changePage(nextPosition: number) {
    setListing(null);
    setError(null);
    setPosition(nextPosition);
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
            <h1 id="mail-title">{selectedMailbox?.name ?? "Inbox"}</h1>
          </div>
          <button
            className="refresh-button"
            disabled={isLoading}
            onClick={refresh}
            type="button"
          >
            <span className="refresh-icon" aria-hidden="true">
              ↻
            </span>
            {isLoading && listing ? "Refreshing…" : "Refresh"}
          </button>
        </header>

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

        {error ? (
          <div className="mail-alert" role="alert">
            <p>{errorMessage(error)}</p>
            {error !== "sign_in_required" ? (
              <button className="inline-retry" onClick={refresh} type="button">
                Try again
              </button>
            ) : null}
          </div>
        ) : null}

        {!listing && isLoading ? (
          <div className="mail-state" role="status" aria-live="polite">
            <span className="loading-indicator" aria-hidden="true" />
            <p>Loading your mail…</p>
          </div>
        ) : null}

        {!listing && !isLoading && !error ? (
          <div className="mail-state">
            <p>Mail is unavailable right now.</p>
            <button className="inline-retry" onClick={refresh} type="button">
              Try again
            </button>
          </div>
        ) : null}

        {listing && listing.messages.length === 0 && !isLoading && !error ? (
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

        {listing && listing.messages.length > 0 ? (
          <ol className={`message-list${isLoading ? " is-loading" : ""}`} aria-label="Messages">
            {listing.messages.map((message) => (
              <li key={message.id}>
                <article
                  className={`message-row${message.isUnread ? " is-unread" : ""}`}
                  aria-label={`${message.isUnread ? "Unread message" : "Read message"} from ${senderLabel(message)}`}
                >
                  <span className="message-state-dot" aria-hidden="true" />
                  <div className="message-copy">
                    <p className="message-sender">{senderLabel(message)}</p>
                    <p className="message-subject">
                      {message.subject?.trim() || "(no subject)"}
                    </p>
                    <p className="message-preview">{message.preview}</p>
                  </div>
                  <time
                    className="message-date"
                    dateTime={message.receivedAt ?? undefined}
                  >
                    {formatDate(message.receivedAt)}
                  </time>
                </article>
              </li>
            ))}
          </ol>
        ) : null}

        {listing && error ? (
          <p className="stale-list-note">Showing the last successfully loaded page.</p>
        ) : null}
      </section>
    </main>
  );
}
