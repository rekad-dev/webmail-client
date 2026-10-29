"use client";

import { toast } from "sonner";

/** What the composer hands over once the draft is saved. The body is the exact `/api/mail/send` request. */
export interface BackgroundSendJob {
  attemptKey: string;
  draftId: string;
  subject: string;
  recipients: string[];
  body: Record<string, unknown>;
}

export interface BackgroundSendCallbacks {
  /** Called whenever a send finishes, however it ended, so lists can refresh. */
  onSettled(outcome: "sent" | "failed" | "unconfirmed"): void;
  onOpenDraft(draftId: string): void;
  onOpenSent(): void;
}

type ServerState = "submitted" | "submitted_sent_update_pending" | "rejected" | "in_progress" | "unknown";

// Unclear results are checked again with the same attempt key, which the server
// treats as a status check and never as a second submission.
const RETRY_DELAYS_MS = [3_000, 10_000, 30_000];

let inFlight = 0;
let leaveGuardInstalled = false;

// Leaving the page would cut off a request that is still being made.
function installLeaveGuard(): void {
  if (leaveGuardInstalled || typeof window === "undefined") return;
  leaveGuardInstalled = true;
  window.addEventListener("beforeunload", (event) => {
    if (inFlight === 0) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

/** True while a message is still being handed to the mail server. */
export function hasSendsInFlight(): boolean {
  return inFlight > 0;
}

export function sendErrorMessage(error: string | undefined): string {
  switch (error) {
    case "sign_in_required":
      return "Your mail session ended before the message was sent. Sign in again, then send it from Drafts.";
    case "invalid_request":
    case "recipient_invalid":
      return "A recipient address is not valid.";
    case "no_recipients":
      return "The message has no recipients.";
    case "too_many_recipients":
      return "The message has too many recipients.";
    case "message_too_large":
      return "The message is too large to send.";
    case "attachment_too_large":
      return "An attachment is over the limit of 4 MiB each and 20 MiB in total.";
    case "sender_forbidden":
      return "The mail server does not allow this From address.";
    case "identity_invalid":
      return "This sender identity is no longer available.";
    case "submission_unavailable":
    case "send_forbidden":
      return "This account is not currently allowed to send mail.";
    case "origin_not_allowed":
      return "The request could not be verified. Reload and try again.";
    case "server_rejected":
    case "send_rejected":
      return "The mail server rejected the message.";
    case "draft_changed":
      return "The saved draft changed on the server. Reopen it before sending.";
    case "banner_settings_unavailable":
      return "The message header and footer are unavailable, so nothing was sent.";
    default:
      return "The message could not be sent.";
  }
}

function recipientSummary(recipients: string[]): string {
  if (recipients.length === 0) return "";
  const shown = recipients.slice(0, 2).join(", ");
  return recipients.length > 2 ? `${shown} and ${recipients.length - 2} more` : shown;
}

function describe(job: BackgroundSendJob): string {
  const subject = job.subject.trim() || "(no subject)";
  const to = recipientSummary(job.recipients);
  return to ? `“${subject}” to ${to}` : `“${subject}”`;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

interface Attempt {
  state: ServerState | "failed";
  error?: string;
}

async function postSend(job: BackgroundSendJob): Promise<Attempt> {
  try {
    const response = await fetch("/api/mail/send", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(job.body),
    });
    const value: unknown = await response.json().catch(() => null);
    const result = value && typeof value === "object" ? value as { state?: unknown; error?: unknown } : {};
    const error = typeof result.error === "string" ? result.error : undefined;
    if (
      result.state === "submitted" ||
      result.state === "submitted_sent_update_pending" ||
      result.state === "rejected" ||
      result.state === "in_progress" ||
      result.state === "unknown"
    ) {
      return { state: result.state, ...(error ? { error } : {}) };
    }
    // The server refused before it reserved anything, so nothing was sent.
    if ([400, 401, 403, 413].includes(response.status)) return { state: "failed", error };
    if (response.status === 503 && error === "banner_settings_unavailable") return { state: "failed", error };
    return { state: "unknown" };
  } catch {
    // The request may have reached the server; a repeat with the same key is a status check.
    return { state: "unknown" };
  }
}

async function run(
  job: BackgroundSendJob,
  toastId: string | number,
  callbacks: BackgroundSendCallbacks,
  retryDelaysMs: number[],
): Promise<void> {
  const what = describe(job);
  const openDraft = { label: "Open draft", onClick: () => callbacks.onOpenDraft(job.draftId) };
  let attempt = await postSend(job);
  for (const delay of retryDelaysMs) {
    if (attempt.state !== "unknown" && attempt.state !== "in_progress") break;
    toast.loading("Confirming the message was sent…", { id: toastId, description: what });
    await wait(delay);
    attempt = await postSend(job);
  }

  if (attempt.state === "submitted" || attempt.state === "submitted_sent_update_pending") {
    toast.success("Message sent", {
      id: toastId,
      description: what,
      duration: 6_000,
      action: { label: "Open Sent", onClick: callbacks.onOpenSent },
    });
    callbacks.onSettled("sent");
    return;
  }
  if (attempt.state === "rejected" || attempt.state === "failed") {
    toast.error("Message not sent", {
      id: toastId,
      description: `${sendErrorMessage(attempt.error)} Your draft is kept in Drafts.`,
      duration: Infinity,
      closeButton: true,
      action: openDraft,
    });
    callbacks.onSettled("failed");
    return;
  }
  toast.warning("Could not confirm the message was sent", {
    id: toastId,
    description: `${what}. Check Sent before sending again. Your draft is kept until it is confirmed.`,
    duration: Infinity,
    closeButton: true,
    action: { label: "Open Sent", onClick: callbacks.onOpenSent },
  });
  callbacks.onSettled("unconfirmed");
}

/**
 * Sends a saved draft without keeping the composer open. The draft stays in
 * Drafts until the mail server accepts the message, so a failure loses nothing.
 */
export function startBackgroundSend(
  job: BackgroundSendJob,
  callbacks: BackgroundSendCallbacks,
  retryDelaysMs: number[] = RETRY_DELAYS_MS,
): void {
  installLeaveGuard();
  inFlight += 1;
  const toastId = toast.loading("Sending message…", { description: describe(job) });
  void run(job, toastId, callbacks, retryDelaysMs).finally(() => {
    inFlight -= 1;
  });
}
