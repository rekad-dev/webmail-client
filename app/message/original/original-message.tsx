"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  decodeHeaderValue,
  firstHeader,
  parseRawMessageHeaders,
} from "@/lib/mail/raw-message-headers.mts";

interface RawMessage {
  text: string;
  size: number;
  truncated: boolean;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; message: RawMessage };

const SUMMARY_FIELDS: Array<[label: string, header: string, decode: boolean]> = [
  ["Message ID", "Message-ID", false],
  ["Date", "Date", false],
  ["From", "From", true],
  ["To", "To", true],
  ["Cc", "Cc", true],
  ["Reply-To", "Reply-To", true],
  ["Subject", "Subject", true],
];

function errorText(reason: string): string {
  if (reason === "sign_in_required") return "Your mail session is no longer available. Sign in again to continue.";
  if (reason === "message_not_found") return "This message is no longer available in your mailbox.";
  return "The original message could not be loaded. Check your connection and try again.";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function OriginalMessage({ emailId, accountId = null }: { emailId: string | null; accountId?: string | null }) {
  const [state, setState] = useState<LoadState>(
    emailId ? { status: "loading" } : { status: "error", message: errorText("message_not_found") },
  );
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!emailId) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    (async () => {
      try {
        const response = await fetch(`/api/mail/original?emailId=${encodeURIComponent(emailId)}${accountId ? `&accountId=${encodeURIComponent(accountId)}` : ""}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body: unknown = await response.json().catch(() => null);
        const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
        if (!response.ok || typeof record?.text !== "string") {
          const reason = typeof record?.error === "string" ? record.error : "mail_unavailable";
          setState({ status: "error", message: errorText(reason) });
          return;
        }
        setState({
          status: "ready",
          message: {
            text: record.text,
            size: typeof record.size === "number" ? record.size : record.text.length,
            truncated: record.truncated === true,
          },
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: errorText("mail_unavailable") });
      }
    })();
    return () => controller.abort();
  }, [emailId, attempt]);

  async function copyOriginal(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  function downloadOriginal(text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "original-message.eml";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const headers = state.status === "ready" ? parseRawMessageHeaders(state.message.text) : [];

  return (
    <main className="original-page">
      <header className="original-header">
        <h1>Original message</h1>
        <a className="original-home-link" href="/">Back to mail</a>
      </header>

      {state.status === "loading" ? (
        <p className="original-status" role="status"><span className="loading-indicator" aria-hidden="true" /> Loading the original message…</p>
      ) : null}

      {state.status === "error" ? (
        <div className="mail-alert" role="alert">
          <p>{state.message}</p>
          {emailId ? (
            <Button onClick={() => setAttempt((value) => value + 1)} size="sm" variant="outline">Try again</Button>
          ) : null}
        </div>
      ) : null}

      {state.status === "ready" ? (
        <>
          <dl className="original-summary">
            {SUMMARY_FIELDS.map(([label, header, decode]) => {
              const value = firstHeader(headers, header);
              if (!value) return null;
              return (
                <div key={header}>
                  <dt>{label}</dt>
                  <dd dir="auto">{decode ? decodeHeaderValue(value) : value}</dd>
                </div>
              );
            })}
            <div>
              <dt>Size</dt>
              <dd>{formatSize(state.message.size)}</dd>
            </div>
          </dl>

          <div className="original-actions">
            <Button
              variant="outline"
              disabled={state.message.truncated}
              onClick={() => downloadOriginal(state.message.text)}
            >
              Download original
            </Button>
            <Button
              variant="outline"
              disabled={state.message.truncated}
              onClick={() => void copyOriginal(state.message.text)}
            >
              Copy to clipboard
            </Button>
            <span className="original-copy-status" role="status">
              {copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : ""}
            </span>
          </div>

          {state.message.truncated ? (
            <p className="message-safety-note">
              This message is large, so only the first 1 MB is shown. Download and copy are unavailable for a partial message.
            </p>
          ) : null}

          <pre className="original-source" tabIndex={0} aria-label="Full message source">{state.message.text}</pre>
        </>
      ) : null}
    </main>
  );
}
