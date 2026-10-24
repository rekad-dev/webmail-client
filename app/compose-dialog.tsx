"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";

interface EmailAddress {
  name: string | null;
  email: string;
}

interface ComposeIdentity {
  id: string;
  name: string;
  email: string;
  isWildcard: boolean;
  replyTo: EmailAddress[];
  bcc: EmailAddress[];
  textSignature: string;
}

interface ComposePreflight {
  submissionAvailable: boolean;
  draftsMailboxId: string | null;
  sentMailboxId: string | null;
  identities: ComposeIdentity[];
}

export interface ComposeFields {
  fromEmail: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
}

interface ReplyHeaders {
  inReplyTo: string[];
  references: string[];
}

interface LoadedDraft extends ComposeFields {
  id: string;
  inReplyTo: string[];
  references: string[];
}

type SendState =
  | "submitted"
  | "submitted_sent_update_pending"
  | "rejected"
  | "in_progress"
  | "unknown";

interface SendResponse {
  state?: SendState;
  error?: string;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseAddresses(value: unknown): EmailAddress[] | null {
  if (!Array.isArray(value)) return null;
  const addresses: EmailAddress[] = [];
  for (const candidate of value) {
    const address = objectValue(candidate);
    if (
      !address ||
      typeof address.email !== "string" ||
      typeof address.name !== "string" && address.name !== null
    ) {
      return null;
    }
    addresses.push({ name: address.name, email: address.email });
  }
  return addresses;
}

function parseLoadedDraft(value: unknown): LoadedDraft | null {
  const draft = objectValue(value);
  if (
    !draft ||
    typeof draft.id !== "string" ||
    typeof draft.subject !== "string" ||
    typeof draft.body !== "string" ||
    !Array.isArray(draft.inReplyTo) ||
    !Array.isArray(draft.references) ||
    !draft.inReplyTo.every((item) => typeof item === "string") ||
    !draft.references.every((item) => typeof item === "string")
  ) return null;
  const from = parseAddresses(draft.from);
  const to = parseAddresses(draft.to);
  const cc = parseAddresses(draft.cc);
  const bcc = parseAddresses(draft.bcc);
  if (!from || !to || !cc || !bcc) return null;
  return {
    id: draft.id,
    fromEmail: from[0]?.email ?? "",
    to: to.map((address) => address.email).join(", "),
    cc: cc.map((address) => address.email).join(", "),
    bcc: bcc.map((address) => address.email).join(", "),
    subject: draft.subject,
    body: draft.body,
    inReplyTo: draft.inReplyTo,
    references: draft.references,
  };
}

function parseAddressesField(value: string): string[] {
  return splitRecipients(value);
}

function parseComposePreflight(value: unknown): ComposePreflight | null {
  const body = objectValue(value);
  if (
    !body ||
    typeof body.submissionAvailable !== "boolean" ||
    typeof body.draftsMailboxId !== "string" && body.draftsMailboxId !== null ||
    typeof body.sentMailboxId !== "string" && body.sentMailboxId !== null ||
    !Array.isArray(body.identities)
  ) {
    return null;
  }

  const identities: ComposeIdentity[] = [];
  for (const candidate of body.identities) {
    const identity = objectValue(candidate);
    const replyTo = parseAddresses(identity?.replyTo);
    const bcc = parseAddresses(identity?.bcc);
    if (
      !identity ||
      typeof identity.id !== "string" ||
      typeof identity.name !== "string" ||
      typeof identity.email !== "string" ||
      typeof identity.isWildcard !== "boolean" ||
      typeof identity.textSignature !== "string" ||
      !replyTo ||
      !bcc
    ) {
      return null;
    }
    identities.push({
      id: identity.id,
      name: identity.name,
      email: identity.email,
      isWildcard: identity.isWildcard,
      replyTo,
      bcc,
      textSignature: identity.textSignature,
    });
  }

  return {
    submissionAvailable: body.submissionAvailable,
    draftsMailboxId: body.draftsMailboxId,
    sentMailboxId: body.sentMailboxId,
    identities,
  };
}

function splitRecipients(value: string): string[] {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function createAttemptKey(): string {
  const bytes = window.crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function identityLabel(identity: ComposeIdentity): string {
  return identity.name
    ? `${identity.name} <${identity.email}>`
    : identity.email;
}

function addressLabel(address: EmailAddress): string {
  return address.name ? `${address.name} <${address.email}>` : address.email;
}

function preflightErrorMessage(error: string): string {
  if (error === "sign_in_required") {
    return "Your mail session has ended. Sign in again to compose a message.";
  }
  if (error === "draft_not_found") {
    return "This saved draft is no longer available in your Drafts mailbox.";
  }
  if (error === "draft_load_failed") {
    return "This saved draft could not be loaded. Check your connection and try again.";
  }
  return "Sender identities could not be loaded. Check your connection and try again.";
}

function sendErrorMessage(error: string | undefined): string {
  switch (error) {
    case "sign_in_required":
      return "Your mail session has ended. Sign in again before sending.";
    case "invalid_request":
    case "recipient_invalid":
      return "Check the recipient addresses and try again.";
    case "no_recipients":
      return "Add at least one recipient before sending.";
    case "too_many_recipients":
      return "This message has too many recipients.";
    case "message_too_large":
      return "This message is too large to submit.";
    case "sender_forbidden":
      return "Stalwart does not allow this From address.";
    case "identity_invalid":
      return "This sender identity is no longer available. Reload compose and try again.";
    case "submission_unavailable":
    case "send_forbidden":
      return "This account is not currently allowed to submit mail through Stalwart.";
    case "origin_not_allowed":
      return "The request could not be verified. Reload rekad Mail and try again.";
    case "server_rejected":
    case "send_rejected":
      return "Stalwart rejected this message. Check its details and try again.";
    case "draft_changed":
      return "This saved draft changed on the server. Reopen it before sending.";
    default:
      return "The message could not be submitted. Check your connection and try again.";
  }
}

function stateMessage(state: SendState): string {
  switch (state) {
    case "submitted":
      return "Submitted to Stalwart. This confirms server acceptance, not recipient delivery.";
    case "submitted_sent_update_pending":
      return "Stalwart accepted the submission. The Sent copy is still being updated.";
    case "rejected":
      return "Stalwart did not accept the message. Your text is still here.";
    case "in_progress":
      return "This send attempt is still being processed. Check its status before starting another.";
    case "unknown":
      return "Submission could not be confirmed. Check Sent before taking another action.";
  }
}

function visibleFocusables(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => element.getClientRects().length > 0);
}

export function ComposeDialog({
  onClose,
  onInspectSent,
  onSubmitted,
  fallbackFocusRef,
  triggerRef,
  mode = "new",
  initialDraftId,
  initialFields,
  initialReplyHeaders,
}: {
  onClose(): void;
  onInspectSent(): void;
  onSubmitted(): void;
  fallbackFocusRef: RefObject<HTMLHeadingElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  mode?: "new" | "reply" | "forward" | "draft";
  initialDraftId?: string;
  initialFields?: Partial<ComposeFields>;
  initialReplyHeaders?: ReplyHeaders;
}) {
  const [preflight, setPreflight] = useState<ComposePreflight | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [identityId, setIdentityId] = useState("");
  const [fields, setFields] = useState<ComposeFields>({
    fromEmail: "",
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
  });
  const [sendState, setSendState] = useState<SendState | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId ?? null);
  const [draftSaveState, setDraftSaveState] = useState<"idle" | "saving" | "saved" | "error" | "cleanup_pending">("idle");
  const [draftSaveError, setDraftSaveError] = useState(false);
  const [replyHeaders, setReplyHeaders] = useState<ReplyHeaders>(initialReplyHeaders ?? {
    inReplyTo: [],
    references: [],
  });
  const attemptKeyRef = useRef<string | null>(null);
  const hasBodyEditsRef = useRef(false);
  const draftIdRef = useRef<string | null>(initialDraftId ?? null);
  const draftRevisionRef = useRef(0);
  const savedDraftRevisionRef = useRef(0);
  const draftSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const dialogRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const identitySelectRef = useRef<HTMLSelectElement | null>(null);
  const toFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      const trigger = triggerRef.current;
      if (trigger && !trigger.disabled) trigger.focus();
      else fallbackFocusRef.current?.focus();
    };
  }, [fallbackFocusRef, triggerRef]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError(null);
    setPreflight(null);

    async function loadIdentities() {
      try {
        const response = await fetch("/api/mail/identities", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        const body: unknown = await response.json();
        if (!response.ok) {
          const error = objectValue(body)?.error;
          throw new Error(typeof error === "string" ? error : "mail_unavailable");
        }
        const nextPreflight = parseComposePreflight(body);
        if (!nextPreflight) throw new Error("mail_unavailable");
        if (controller.signal.aborted) return;

        setPreflight(nextPreflight);
        let loadedDraft: LoadedDraft | null = null;
        if (initialDraftId) {
          const draftResponse = await fetch(
            `/api/mail/drafts?draftId=${encodeURIComponent(initialDraftId)}`,
            {
              method: "GET",
              credentials: "same-origin",
              cache: "no-store",
              signal: controller.signal,
              headers: { accept: "application/json" },
            },
          );
          const draftBody: unknown = await draftResponse.json();
          if (!draftResponse.ok) {
            const reason = objectValue(draftBody)?.error;
            throw new Error(
              reason === "sign_in_required" || reason === "draft_not_found"
                ? reason
                : "draft_load_failed",
            );
          }
          loadedDraft = parseLoadedDraft(draftBody);
          if (!loadedDraft) throw new Error("draft_load_failed");
          setDraftId(loadedDraft.id);
          draftIdRef.current = loadedDraft.id;
          setReplyHeaders({
            inReplyTo: loadedDraft.inReplyTo,
            references: loadedDraft.references,
          });
        }

        const initialIdentity = loadedDraft
          ? nextPreflight.identities.find((identity) =>
              identity.isWildcard
                ? loadedDraft!.fromEmail.toLowerCase().endsWith(`@${identity.email.slice(2).toLowerCase()}`)
                : identity.email.toLowerCase() === loadedDraft!.fromEmail.toLowerCase(),
            ) ?? null
          : nextPreflight.identities.length === 1
            ? nextPreflight.identities[0]
            : null;
        setIdentityId(initialIdentity?.id ?? "");
        const signature = initialIdentity?.textSignature
          ? `\n\n${initialIdentity.textSignature}`
          : "";
        setFields(loadedDraft ?? {
          fromEmail: initialFields?.fromEmail ?? "",
          to: initialFields?.to ?? "",
          cc: initialFields?.cc ?? "",
          bcc: initialFields?.bcc ?? "",
          subject: initialFields?.subject ?? "",
          body: initialFields?.body ?? signature,
        });
        hasBodyEditsRef.current = Boolean(loadedDraft || initialFields?.body);
        draftRevisionRef.current = loadedDraft
          ? 0
          : initialFields && Object.values(initialFields).some(Boolean)
            ? 1
            : 0;
        savedDraftRevisionRef.current = 0;
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : "mail_unavailable");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadIdentities();
    return () => controller.abort();
  }, [reloadVersion, initialDraftId]);

  useEffect(() => {
    if (isLoading || loadError || !preflight) {
      titleRef.current?.focus();
      return;
    }
    if (toFieldRef.current) toFieldRef.current.focus();
    else identitySelectRef.current?.focus();
  }, [isLoading, loadError, preflight]);

  const selectedIdentity = preflight?.identities.find(
    (identity) => identity.id === identityId,
  ) ?? null;
  const canEdit = !isSending &&
    sendState !== "in_progress" &&
    sendState !== "unknown" &&
    sendState !== "submitted" &&
    sendState !== "submitted_sent_update_pending";
  const canSend = Boolean(
    preflight?.submissionAvailable &&
    preflight.draftsMailboxId &&
    preflight.sentMailboxId &&
    selectedIdentity &&
    canEdit,
  );
  const canCheckStatus =
    (sendState === "unknown" || sendState === "in_progress") &&
    attemptKeyRef.current !== null;

  function queueDraftSave(
    snapshot: ComposeFields,
    selectedIdentityId: string,
    revision: number,
    force = false,
  ): Promise<void> {
    const task = draftSaveQueueRef.current.then(async () => {
      if (revision <= savedDraftRevisionRef.current) return;
      if (!force && revision < draftRevisionRef.current) return;
      setDraftSaveState("saving");
      setDraftSaveError(false);
      const response = await fetch("/api/mail/drafts", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...(draftIdRef.current ? { draftId: draftIdRef.current } : {}),
          identityId: selectedIdentityId,
          ...(snapshot.fromEmail.trim()
            ? { fromEmail: snapshot.fromEmail.trim() }
            : {}),
          to: parseAddressesField(snapshot.to),
          cc: parseAddressesField(snapshot.cc),
          bcc: parseAddressesField(snapshot.bcc),
          subject: snapshot.subject,
          body: snapshot.body,
          inReplyTo: replyHeaders.inReplyTo,
          references: replyHeaders.references,
        }),
      });
      const body: unknown = await response.json();
      const result = objectValue(body);
      if (!response.ok || typeof result?.draftId !== "string") {
        const reason = result?.error;
        throw new Error(typeof reason === "string" ? reason : "draft_save_failed");
      }
      draftIdRef.current = result.draftId;
      setDraftId(result.draftId);
      savedDraftRevisionRef.current = revision;
      setDraftSaveState(result.previousRemoved === false ? "cleanup_pending" : "saved");
      setDraftSaveError(false);
    });
    draftSaveQueueRef.current = task.catch(() => undefined);
    return task.catch(() => {
      setDraftSaveState("error");
      setDraftSaveError(true);
      throw new Error("draft_save_failed");
    });
  }

  async function saveDraftNow(): Promise<void> {
    const revision = draftRevisionRef.current;
    if (revision <= savedDraftRevisionRef.current && draftIdRef.current) return;
    if (!selectedIdentity) throw new Error("draft_identity_missing");
    await queueDraftSave(fields, selectedIdentity.id, revision, true);
    if (!draftIdRef.current) throw new Error("draft_save_failed");
  }

  async function closeCompose(): Promise<void> {
    if (
      selectedIdentity &&
      sendState !== "submitted" &&
      sendState !== "submitted_sent_update_pending" &&
      draftRevisionRef.current > savedDraftRevisionRef.current
    ) {
      try {
        await saveDraftNow();
      } catch {
        setFormError("This draft could not be saved. Keep it open and try again.");
        return;
      }
    }
    onClose();
  }

  useEffect(() => {
    if (
      !selectedIdentity ||
      !preflight?.draftsMailboxId ||
      isLoading ||
      sendState === "submitted" ||
      sendState === "submitted_sent_update_pending" ||
      isSending ||
      draftRevisionRef.current <= savedDraftRevisionRef.current
    ) return;
    const snapshot = fields;
    const identityIdSnapshot = selectedIdentity.id;
    const revision = draftRevisionRef.current;
    const timer = window.setTimeout(() => {
      void queueDraftSave(snapshot, identityIdSnapshot, revision).catch(() => undefined);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [fields, identityId, isLoading, isSending, preflight?.draftsMailboxId, sendState]);

  function updateFields(patch: Partial<ComposeFields>) {
    setFields((current) => ({ ...current, ...patch }));
    draftRevisionRef.current += 1;
    setDraftSaveState("idle");
    setDraftSaveError(false);
    attemptKeyRef.current = null;
    setSendState(null);
    setSendError(null);
    setFormError(null);
  }

  function selectIdentity(nextIdentityId: string) {
    const nextIdentity = preflight?.identities.find(
      (identity) => identity.id === nextIdentityId,
    );
    setIdentityId(nextIdentityId);
    attemptKeyRef.current = null;
    setSendState(null);
    setSendError(null);
    setFormError(null);
    if (!nextIdentity) return;
    setFields((current) => ({
      ...current,
      fromEmail: "",
      bcc: "",
      body: hasBodyEditsRef.current
        ? current.body
        : nextIdentity.textSignature
          ? `\n\n${nextIdentity.textSignature}`
          : "",
    }));
    draftRevisionRef.current += 1;
    setDraftSaveState("idle");
    setDraftSaveError(false);
    window.setTimeout(() => toFieldRef.current?.focus(), 0);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedIdentity || !preflight || isSending) return;

    const to = splitRecipients(fields.to);
    const cc = splitRecipients(fields.cc);
    const bcc = splitRecipients(fields.bcc);
    const totalRecipients = to.length + cc.length + bcc.length + selectedIdentity.bcc.length;
    if (totalRecipients === 0) {
      setFormError("Add at least one recipient before sending.");
      return;
    }
    if (totalRecipients > 50) {
      setFormError("This message has too many recipients.");
      return;
    }
    if (selectedIdentity.isWildcard && !fields.fromEmail.trim()) {
      setFormError("Enter the From address to use for this wildcard identity.");
      return;
    }

    setIsSending(true);
    setSendError(null);
    setFormError(null);
    try {
      await saveDraftNow();
    } catch {
      setIsSending(false);
      setFormError("This draft could not be saved. Check your connection and try again.");
      return;
    }
    const savedDraftId = draftIdRef.current;
    if (!savedDraftId) {
      setIsSending(false);
      setFormError("This draft could not be saved. Check your connection and try again.");
      return;
    }

    let attemptKey: string;
    try {
      attemptKey = attemptKeyRef.current ?? createAttemptKey();
    } catch {
      setIsSending(false);
      setFormError("A secure send request could not be created in this browser.");
      return;
    }
    attemptKeyRef.current = attemptKey;

    try {
      const response = await fetch("/api/mail/send", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          attemptKey,
          draftId: savedDraftId,
          identityId: selectedIdentity.id,
          ...(selectedIdentity.isWildcard
            ? { fromEmail: fields.fromEmail.trim() }
            : {}),
          to,
          cc,
          bcc,
          subject: fields.subject,
          body: fields.body,
          inReplyTo: replyHeaders.inReplyTo,
          references: replyHeaders.references,
        }),
      });
      const body: unknown = await response.json();
      const result = objectValue(body) as SendResponse | null;
      if (
        result?.state === "submitted" ||
        result?.state === "submitted_sent_update_pending" ||
        result?.state === "rejected" ||
        result?.state === "in_progress" ||
        result?.state === "unknown"
      ) {
        setSendState(result.state);
        setSendError(result.state === "rejected"
          ? sendErrorMessage(result.error)
          : null);
        if (
          result.state === "submitted" ||
          result.state === "submitted_sent_update_pending"
        ) {
          onSubmitted();
        }
      } else if (response.status === 400 || response.status === 413) {
        setSendError(sendErrorMessage(
          typeof result?.error === "string" ? result.error : "invalid_request",
        ));
      } else if (response.status === 401 || response.status === 403) {
        setSendError(sendErrorMessage(
          typeof result?.error === "string" ? result.error : "mail_unavailable",
        ));
      } else {
        setSendState("unknown");
        setSendError(null);
      }
    } catch {
      setSendState("unknown");
      setSendError(null);
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!isSending) void closeCompose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;

    const focusables = visibleFocusables(dialogRef.current);
    if (focusables.length === 0) {
      event.preventDefault();
      titleRef.current?.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const requiresIdentity = !isLoading && !loadError && preflight &&
    preflight.identities.length > 1 && !selectedIdentity;
  const preflightUnavailable = !isLoading && !loadError && preflight &&
    (!preflight.submissionAvailable ||
      !preflight.draftsMailboxId ||
      !preflight.sentMailboxId ||
      preflight.identities.length === 0);
  const composeHeading = mode === "reply"
    ? "Reply"
    : mode === "forward"
      ? "Forward"
      : mode === "draft"
        ? "Continue draft"
        : "Compose";

  return (
    <div className="compose-backdrop">
      <section
        aria-labelledby="compose-title"
        aria-modal="true"
        className="compose-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="compose-header">
          <div>
            <p className="eyebrow">{mode === "reply" ? "Replying" : mode === "forward" ? "Forwarding" : mode === "draft" ? "Saved draft" : "New message"}</p>
            <h2 id="compose-title" ref={titleRef} tabIndex={-1}>{composeHeading}</h2>
          </div>
          <button
            aria-label="Close compose"
            className="compose-close"
            disabled={isSending}
            onClick={() => void closeCompose()}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        {isLoading ? (
          <div className="compose-state" role="status" aria-live="polite">
            <span className="loading-indicator" aria-hidden="true" />
            <p>{initialDraftId ? "Loading saved draft…" : "Checking send capability and identities…"}</p>
          </div>
        ) : null}

        {loadError ? (
          <div className="compose-feedback compose-feedback-error" role="alert">
            <p>{preflightErrorMessage(loadError)}</p>
            <button
              className="inline-retry"
              onClick={() => setReloadVersion((version) => version + 1)}
              type="button"
            >
              Try again
            </button>
          </div>
        ) : null}

        {preflightUnavailable ? (
          <div className="compose-feedback compose-feedback-error" role="alert">
            <p>
              {!preflight.submissionAvailable
                ? "This account does not advertise JMAP mail submission."
                : !preflight.draftsMailboxId || !preflight.sentMailboxId
                  ? "This account needs Drafts and Sent mailboxes before it can send."
                  : "This account has no available sending identity."}
            </p>
          </div>
        ) : null}

        {requiresIdentity ? (
          <div className="compose-field compose-identity-prompt">
            <label htmlFor="compose-identity">From</label>
            <select
              autoComplete="off"
              id="compose-identity"
              onChange={(event) => selectIdentity(event.target.value)}
              ref={identitySelectRef}
              value={identityId}
            >
              <option value="">Choose a sender identity</option>
              {preflight.identities.map((identity) => (
                <option key={identity.id} value={identity.id}>
                  {identityLabel(identity)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {selectedIdentity && preflight && !preflightUnavailable ? (
          <form className="compose-form" onSubmit={submit}>
            {preflight.identities.length === 1 ? (
              <div className="compose-field">
                {selectedIdentity.isWildcard ? (
                  <>
                    <label htmlFor="compose-from">From address</label>
                    <input
                      autoComplete="off"
                      autoCapitalize="none"
                      disabled={!canEdit}
                      id="compose-from"
                      onChange={(event) => updateFields({ fromEmail: event.target.value })}
                      placeholder="name@example.com"
                      type="email"
                      value={fields.fromEmail}
                    />
                  </>
                ) : (
                  <>
                    <span className="compose-label">From</span>
                    <p className="compose-static-value">{identityLabel(selectedIdentity)}</p>
                  </>
                )}
              </div>
            ) : null}
            {preflight.identities.length > 1 ? (
              <div className="compose-field">
                <label htmlFor="compose-identity">From</label>
                <select
                  autoComplete="off"
                  disabled={!canEdit}
                  id="compose-identity"
                  onChange={(event) => selectIdentity(event.target.value)}
                  ref={identitySelectRef}
                  value={identityId}
                >
                  <option value="">Choose a sender identity</option>
                  {preflight.identities.map((identity) => (
                    <option key={identity.id} value={identity.id}>
                      {identityLabel(identity)}
                    </option>
                  ))}
                </select>
                {selectedIdentity.isWildcard ? (
                  <>
                    <label htmlFor="compose-from">From address</label>
                    <input
                      autoComplete="off"
                      disabled={!canEdit}
                      id="compose-from"
                      onChange={(event) => updateFields({ fromEmail: event.target.value })}
                      placeholder="name@example.com"
                      type="email"
                      value={fields.fromEmail}
                    />
                  </>
                ) : null}
              </div>
            ) : null}
            {selectedIdentity.replyTo.length > 0 ? (
              <p className="compose-default-note">
                Replies go to {selectedIdentity.replyTo.map(addressLabel).join(", ")}.
              </p>
            ) : null}
            {selectedIdentity.bcc.length > 0 ? (
              <div className="compose-default-bcc">
                <span className="compose-label">Always Bcc</span>
                <ul>
                  {selectedIdentity.bcc.map((address, index) => (
                    <li key={`${address.email}-${index}`}>{addressLabel(address)}</li>
                  ))}
                </ul>
                <p>This identity adds these recipients to every message.</p>
              </div>
            ) : null}

            <div className="compose-field">
              <label htmlFor="compose-to">To</label>
              <input
                autoComplete="off"
                autoCapitalize="none"
                disabled={!canEdit}
                id="compose-to"
                inputMode="email"
                onChange={(event) => updateFields({ to: event.target.value })}
                placeholder="name@example.com, another@example.com"
                ref={toFieldRef}
                type="text"
                value={fields.to}
              />
              <span className="compose-help">Separate addresses with commas.</span>
            </div>
            <div className="compose-field">
              <label htmlFor="compose-cc">Cc</label>
              <input
                autoComplete="off"
                autoCapitalize="none"
                disabled={!canEdit}
                id="compose-cc"
                inputMode="email"
                onChange={(event) => updateFields({ cc: event.target.value })}
                placeholder="Optional"
                type="text"
                value={fields.cc}
              />
            </div>
            <div className="compose-field">
              <label htmlFor="compose-bcc">Bcc</label>
              <input
                autoComplete="off"
                autoCapitalize="none"
                disabled={!canEdit}
                id="compose-bcc"
                inputMode="email"
                onChange={(event) => updateFields({ bcc: event.target.value })}
                placeholder="Optional"
                type="text"
                value={fields.bcc}
              />
              <span className="compose-help">Separate addresses with commas.</span>
            </div>
            <div className="compose-field">
              <label htmlFor="compose-subject">Subject</label>
              <input
                autoComplete="off"
                disabled={!canEdit}
                id="compose-subject"
                maxLength={998}
                onChange={(event) => updateFields({ subject: event.target.value })}
                type="text"
                value={fields.subject}
              />
            </div>
            <div className="compose-field compose-body-field">
              <label htmlFor="compose-body">Message</label>
              <textarea
                disabled={!canEdit}
                id="compose-body"
                maxLength={256 * 1024}
                onChange={(event) => {
                  hasBodyEditsRef.current = true;
                  updateFields({ body: event.target.value });
                }}
                rows={10}
                value={fields.body}
              />
              <span className="compose-help">
                Plain text only. The selected identity signature is included when configured.
              </span>
            </div>

            {sendError ? (
              <p className="compose-send-error" role="alert">{sendError}</p>
            ) : null}
            {sendState ? (
              <div
                className={`compose-send-state${sendState === "rejected" ? " is-error" : ""}`}
                role={sendState === "rejected" ? "alert" : "status"}
                aria-live="polite"
              >
                <p>{stateMessage(sendState)}</p>
                {sendState === "unknown" || sendState === "in_progress" ? (
                  <p className="compose-help">
                    This status check reuses the same attempt and will not start a second submission.
                  </p>
                ) : null}
              </div>
            ) : null}
            {formError ? (
              <p className="compose-send-error" role="alert">{formError}</p>
            ) : null}

            <p className={`draft-save-status${draftSaveError ? " is-error" : ""}`} role="status" aria-live="polite">
              {draftSaveState === "saving"
                ? "Saving draft…"
                : draftSaveState === "saved"
                  ? "Draft saved to Drafts."
                  : draftSaveState === "cleanup_pending"
                    ? "Draft saved. An older revision may still appear in Drafts."
                    : draftSaveState === "error"
                      ? "Draft could not be saved. It remains in this window until you close it."
                      : draftId
                        ? "Draft is stored in Drafts."
                        : "Changes save to Drafts automatically."}
            </p>

            <footer className="compose-actions">
              {(sendState === "unknown" || sendState === "in_progress") ? (
                <button
                  className="compose-secondary-action"
                  onClick={onInspectSent}
                  type="button"
                >
                  Open Sent
                </button>
              ) : (
                <button
                  className="compose-secondary-action"
                  disabled={isSending}
                  onClick={() => void closeCompose()}
                  type="button"
                >
                  {sendState === "submitted" || sendState === "submitted_sent_update_pending"
                    ? "Close"
                    : "Cancel"}
                </button>
              )}
              <button
                className="compose-send-button"
                disabled={isSending || (!canSend && !canCheckStatus)}
                type="submit"
              >
                {isSending
                  ? "Sending…"
                  : sendState === "unknown" || sendState === "in_progress"
                    ? "Check status"
                    : "Send"}
              </button>
            </footer>
          </form>
        ) : !isLoading && !loadError && !preflightUnavailable && !requiresIdentity ? (
          <div className="compose-state" role="status">
            <p>Choose a sender identity to continue.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
