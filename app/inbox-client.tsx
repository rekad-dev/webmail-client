"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import Image from "next/image";
import { ComposeDialog } from "./compose-dialog";
import { startBackgroundSend, type BackgroundSendJob } from "@/components/mail/background-send";
import type { ComposeFields } from "./compose-dialog";
import { plainTextEditorContent } from "./rich-text-editor";
import { MailIcon, type MailIconName } from "./mail-icons";
import { Button } from "@/components/ui/button";
import { MessageDetailView } from "@/components/mail/message-detail-view";
import { AccountMenu } from "@/components/mail/account-menu";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { BulkToolbar } from "@/components/mail/bulk-toolbar";
import { ConversationList } from "@/components/mail/conversation-list";
import { ConversationThread } from "@/components/mail/conversation-thread";
import { MailboxNav } from "@/components/mail/mailbox-nav";
import { SharedAccountNav } from "@/components/mail/shared-account-nav";
import { MailSearch, type SearchFilters } from "@/components/mail/mail-search";
import { SettingsView } from "./settings/settings-view";
import { useSessionGuard } from "@/components/mail/use-session-guard";
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
import { OFFLINE_COPIES_ENABLED } from "../lib/offline/feature.mts";

import type {
  EmailAddress,
  EmailDetail,
  EmailSummary,
  SharedAccount,
  MailAction,
  MailListing,
  Mailbox,
  ThreadView,
} from "@/components/mail/types";
import {
  addressLabel,
  avatarTone,
  formatDate,
  formatDetailDate,
  formatFileSize,
  mailboxIcon,
  senderInitials,
  senderLabel,
} from "@/components/mail/format";

export type { EmailDetail, MailListing, ThreadView };

const PAGE_SIZE = 25;

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

interface ComposeRequest {
  mode: "new" | "reply" | "forward" | "draft";
  draftId?: string;
  fields?: Partial<ComposeFields>;
  headers?: { inReplyTo: string[]; references: string[] };
  trigger: HTMLButtonElement | null;
  label: string;
}


async function requestMailAction(
  action: MailAction,
  target: { emailId: string } | { threadId: string },
  destinationMailboxId?: string,
  sourceMailboxId?: string,
  accountId?: string | null,
): Promise<void> {
  const body: Record<string, string> = { action, ...target };
  if (accountId) body.accountId = accountId;
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
  if (error === "account_not_found") {
    return "You no longer have access to that shared mailbox. Showing your own mail instead.";
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
    case "account_read_only":
      return "This shared mailbox is read-only, so the message was left unchanged.";
    case "account_not_found":
      return "You no longer have access to this shared mailbox. Refresh and try again.";
    default:
      return "That mailbox action could not be saved. The current view will refresh.";
  }
}

export function InboxClient({
  accountName,
  accountEmail,
  profilePictureVersion = null,
  profilePictureAvailable = false,
  initialSettings = false,
  localPreview = false,
  initialListing,
  initialThreads,
  initialDetails,
}: {
  accountName?: string | null;
  accountEmail?: string | null;
  profilePictureVersion?: number | null;
  profilePictureAvailable?: boolean;
  initialSettings?: boolean;
  localPreview?: boolean;
  initialListing?: MailListing;
  initialThreads?: Record<string, ThreadView>;
  initialDetails?: Record<string, EmailDetail>;
}) {
  const previewId = useId();
  const [actionSessionEnded, setActionSessionEnded] = useState(false);
  const [pictureVersion, setPictureVersion] = useState(profilePictureVersion);
  const [showSettings, setShowSettings] = useState(initialSettings);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [favorites, setFavorites] = useState(false);
  const [sharedAccounts, setSharedAccounts] = useState<SharedAccount[]>([]);
  const [sharedAccountId, setSharedAccountId] = useState<string | null>(null);
  const sharedReadOnlyRef = useRef(false);
  const [selectedThreadIds, setSelectedThreadIds] = useState<Set<string>>(() => new Set());
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [mailboxId, setMailboxId] = useState<string | null>(
    () => initialListing?.selectedMailboxId ?? null,
  );
  const [searchInput, setSearchInput] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({ hasAttachment: false, recent: false, fromMe: false });
  const [position, setPosition] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [manualRefreshTarget, setManualRefreshTarget] = useState<"list" | "thread" | "message" | null>(null);
  const [listing, setListing] = useState<MailListing | null>(
    () => initialListing ?? null,
  );
  const [mailboxes, setMailboxes] = useState<Mailbox[] | undefined>(() => initialListing?.mailboxes);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!localPreview);
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
  const [offlineStatus, setOfflineStatus] = useState(() => localPreview
    ? "Offline tools are disabled in this local preview."
    : "Preparing offline copies…");
  const [offlineSavePendingId, setOfflineSavePendingId] = useState<string | null>(null);
  const [offlineSaveError, setOfflineSaveError] = useState<string | null>(null);
  const [notificationsReady, setNotificationsReady] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsSupported, setNotificationsSupported] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<string | null>(null);
  const offlineSyncPending = useRef(false);
  const notificationPollRef = useRef<(() => void) | null>(null);
  const [readUpdateError, setReadUpdateError] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [pendingMailboxNavigation, setPendingMailboxNavigation] = useState<{ id: number; action: () => void } | null>(null);
  const mailboxNavigationSequence = useRef(0);
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
    const onHistory = () => setShowSettings(window.location.pathname === "/settings");
    window.addEventListener("popstate", onHistory);
    return () => window.removeEventListener("popstate", onHistory);
  }, []);

  function showMail() {
    if (!showSettings) return;
    setShowSettings(false);
    window.history.pushState(null, "", localPreview ? "/local-preview" : "/");
  }

  function openSettings() {
    if (showSettings) return;
    setShowSettings(true);
    window.history.pushState(null, "", "/settings");
  }

  function requestMailboxNavigation(action: () => void) {
    if (!isComposeOpen) { action(); return; }
    if (pendingMailboxNavigation) return;
    setIsComposeMinimized(false);
    setPendingMailboxNavigation({ id: ++mailboxNavigationSequence.current, action });
  }

  useEffect(() => {
    if (localPreview) return;
    setNotificationsSupported("Notification" in window);
    let active = true;
    if (!("serviceWorker" in navigator)) {
      if (OFFLINE_COPIES_ENABLED) setOfflineStatus("Offline copies are available, but this browser does not support an offline page.");
    } else if (OFFLINE_COPIES_ENABLED) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        if (active) setOfflineStatus("Offline copies are ready, but the offline page could not be installed.");
      });
    } else {
      // Remove the offline worker that an earlier version installed.
      void navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined);
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
  }, [localPreview]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = searchInput.trim();
      if (normalized !== searchText) {
        setPosition(0);
        if (localPreview) {
          const query = normalized.toLocaleLowerCase();
          const messages = initialListing
            ? query
              ? initialListing.messages.filter((message) => [
                  message.subject ?? "",
                  message.preview,
                  senderLabel(message),
                ].some((value) => value.toLocaleLowerCase().includes(query)))
              : initialListing.messages
            : null;
          setListing(initialListing && messages ? {
            ...initialListing,
            messages,
            total: messages.length,
          } : null);
        } else {
          setListing(null);
        }
        setSearchText(normalized);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput, searchText, localPreview, initialListing]);

  useEffect(() => {
    if (localPreview || !OFFLINE_COPIES_ENABLED) return;
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
  }, [localPreview, offlineReady, offlineScope, refreshVersion]);

  useEffect(() => {
    if (localPreview) return;
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
  }, [localPreview, notificationsReady, notificationsSupported, offlineScope]);

  useEffect(() => {
    if (localPreview) return;
    if (mailboxId && skipMailboxFetch.current === mailboxId) {
      skipMailboxFetch.current = null;
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ position: String(position) });
    if (mailboxId) params.set("mailboxId", mailboxId);
    if (sharedAccountId) params.set("accountId", sharedAccountId);
    if (favorites) params.set("favorites", "1");
    if (searchText) {
      params.set("q", searchText);
    }
    if (searchFilters.hasAttachment) params.set("hasAttachment", "1");
    if (searchFilters.recent) params.set("recent", "1");
    if (searchFilters.fromMe && accountEmail) params.set("from", accountEmail);

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
        setMailboxes(nextListing.mailboxes);
        if (!mailboxId) {
          skipMailboxFetch.current = nextListing.selectedMailboxId;
          setMailboxId(nextListing.selectedMailboxId);
        }
      } catch (loadError) {
        if (controller.signal.aborted) return;
        const reason =
          loadError instanceof Error ? loadError.message : "mail_unavailable";
        setError(reason);
        if (reason === "account_not_found") {
          // The group account was removed or access was revoked: fall back to the user's own mail.
          setSharedAccountId(null);
          setSharedAccounts((accounts) => accounts.filter((account) => account.id !== sharedAccountId));
          setListing(null);
          setMailboxes(undefined);
          setMailboxId(null);
          setPosition(0);
        }
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
  }, [localPreview, mailboxId, position, refreshVersion, searchText, favorites, sharedAccountId, searchFilters, accountEmail]);

  useEffect(() => {
    if (localPreview) return;
    if (!openThreadId) return;
    const threadId = openThreadId;
    const controller = new AbortController();
    async function loadThread() {
      setThreadLoading(true);
      setThreadError(null);
      try {
        const query = new URLSearchParams({ threadId });
        if (sharedAccountId) query.set("accountId", sharedAccountId);
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
  }, [localPreview, openThreadId, threadRefreshVersion, sharedAccountId]);

  useEffect(() => {
    if (localPreview) return;
    if (!openEmailId) return;
    const emailId = openEmailId;

    const controller = new AbortController();
    async function loadMessage() {
      let readUpdateAttempted = false;
      setDetailLoading(true);
      setDetailError(null);
      setReadUpdateError(false);
      setEmailDetail(null);

      try {
        const query = new URLSearchParams({ emailId });
        if (sharedAccountId) query.set("accountId", sharedAccountId);
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

        if (nextDetail.isUnread && !sharedReadOnlyRef.current) {
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
  }, [localPreview, openEmailId, detailRefreshVersion, sharedAccountId]);

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
  }, [mailboxId, position, searchText, favorites, sharedAccountId]);

  useEffect(() => {
    if (localPreview) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/mail/accounts", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        if (!response.ok) return;
        const body: unknown = await response.json();
        const accounts = (body as { sharedAccounts?: unknown })?.sharedAccounts;
        if (!Array.isArray(accounts)) return;
        setSharedAccounts(
          accounts.flatMap((account): SharedAccount[] =>
            account && typeof account.id === "string" && typeof account.name === "string"
              ? [{ id: account.id, name: account.name, isReadOnly: account.isReadOnly === true }]
              : [],
          ),
        );
      } catch {
        // Shared mail is optional; the user's own mailbox keeps working.
      }
    })();
    return () => controller.abort();
  }, [localPreview, refreshVersion]);

  const selectedMailbox = mailboxes?.find((mailbox) => mailbox.id === mailboxId);
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

  const pageRange = listing
    ? listing.messages.length === 0
      ? "0"
      : listing.total === null
        ? `${firstResult}–${lastResult}`
        : `${firstResult}–${lastResult} of ${listing.total.toLocaleString()}`
    : "";

  function refresh() {
    if (localPreview) return;
    const target = openEmailId ? "message" : openThreadId ? "thread" : "list";
    setManualRefreshTarget(target);
    // Progress shows on the click itself; the fetches below confirm it and clear it when they finish.
    if (target === "message") setDetailLoading(true);
    else if (target === "thread") setThreadLoading(true);
    else setIsLoading(true);
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

  function selectSharedAccount(nextAccountId: string | null) {
    if (localPreview) return;
    if (nextAccountId === sharedAccountId) {
      if (showSettings) { setOpenEmailId(null); setOpenThreadId(null); setEmailDetail(null); setThreadView(null); }
      return;
    }
    sharedReadOnlyRef.current = sharedAccounts.find((account) => account.id === nextAccountId)?.isReadOnly === true;
    setSharedAccountId(nextAccountId);
    setFavorites(false);
    setManualRefreshTarget(null);
    restoreMessageFocus.current = false;
    skipMailboxFetch.current = null;
    setListing(null);
    setMailboxes(undefined);
    setMailboxId(null);
    setSearchInput("");
    setSearchText("");
    setSearchFilters({ hasAttachment: false, recent: false, fromMe: false });
    setError(null);
    setActionError(null);
    setPosition(0);
    setOpenEmailId(null);
    setOpenThreadId(null);
    setThreadView(null);
    setEmailDetail(null);
  }

  function selectMailbox(nextMailboxId: string) {
    if (localPreview) return;
    if (nextMailboxId === mailboxId && !favorites) {
      if (showSettings) { setOpenEmailId(null); setOpenThreadId(null); setEmailDetail(null); setThreadView(null); }
      return;
    }
    setFavorites(false);
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

  function selectFavorites() {
    if (localPreview) return;
    if (favorites) {
      if (showSettings) { setOpenEmailId(null); setOpenThreadId(null); setEmailDetail(null); setThreadView(null); }
      return;
    }
    setFavorites(true);
    setListing(null);
    setPosition(0);
    setError(null);
    setActionError(null);
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
    if (localPreview) return;
    if (actionPending) return;
    setActionPending(true);
    setActionError(null);
    try {
      await requestMailAction(action, target, destinationMailboxId, favorites ? undefined : listing?.selectedMailboxId, sharedAccountId);
      if (action === "mark_unread" && "emailId" in target && target.emailId === openEmailId) {
        closeMessage();
      }
      setRefreshVersion((value) => value + 1);
      if (openThreadId) setThreadRefreshVersion((value) => value + 1);
      if (openEmailId && action !== "mark_unread") {
        setDetailRefreshVersion((value) => value + 1);
      }
    } catch (error) {
      if (error instanceof Error && error.message === "sign_in_required") setActionSessionEnded(true);
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
    if (localPreview) return;
    const targets = listing?.messages.filter((message) =>
      !message.isDraft && selectedThreadIds.has(message.threadId)) ?? [];
    if (actionPending || targets.length === 0) return;
    setActionPending(true);
    setActionError(null);
    const completed = new Set<string>();
    try {
      for (const message of targets) {
        await requestMailAction(action, { threadId: message.threadId }, destinationMailboxId, favorites ? undefined : listing?.selectedMailboxId, sharedAccountId);
        completed.add(message.threadId);
      }
    } catch (error) {
      if (error instanceof Error && error.message === "sign_in_required") setActionSessionEnded(true);
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
    const quotedHtml = detail.htmlBody
      ? `<blockquote>${detail.htmlBody}</blockquote>`
      : `<blockquote>${plainTextEditorContent(detail.textBody ?? "")}</blockquote>`;
    openCompose("reply", {
      to: targets.map((address) => address.email).join(", "),
      subject: replySubject,
      body: `\n\nOn ${date}, ${author} wrote:\n${quote}`,
      htmlBody: `<p><br></p>${plainTextEditorContent(`On ${date}, ${author} wrote:`)}${quotedHtml}`,
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
    const forwardedHtml = detail.htmlBody
      ? `<blockquote>${detail.htmlBody}</blockquote>`
      : `<blockquote>${plainTextEditorContent(detail.textBody ?? "")}</blockquote>`;
    openCompose("forward", {
      subject: forwardSubject,
      body: `\n\n${headerLines.join("\n")}\n\n${detail.textBody ?? ""}`,
      htmlBody: `<p><br></p>${plainTextEditorContent(headerLines.join("\n"))}${forwardedHtml}`,
    }, { inReplyTo: [], references: [] }, trigger);
  }

  function changePage(nextPosition: number) {
    if (localPreview) return;
    setManualRefreshTarget(null);
    setListing(null);
    setError(null);
    setPosition(nextPosition);
  }

  function selectMailboxByRole(role: "inbox" | "sent") {
    if (localPreview) return;
    setManualRefreshTarget(null);
    const target = listing?.mailboxes.find((mailbox) => mailbox.role === role);
    if (!target) return;
    setListing(null);
    setError(null);
    setActionError(null);
    setPosition(0);
    setSearchInput("");
    setSearchText("");
    setMailboxId(target.id);
    setRefreshVersion((value) => value + 1);
    setOpenThreadId(null);
    setOpenEmailId(null);
    setThreadView(null);
    setEmailDetail(null);
  }

  /** Opens a saved draft, for example from a "Message not sent" notice. */
  function openDraftById(draftId: string) {
    const request: ComposeRequest = {
      mode: "draft",
      draftId,
      trigger: composeButtonRef.current,
      label: "Draft",
    };
    if (isComposeOpen) {
      setPendingComposeRequest(request);
      setIsComposeMinimized(false);
      return;
    }
    startComposeRequest(request);
  }

  // The send outlives the composer, so its notices call back into whatever is current.
  const sendActionsRef = useRef({ openDraftById, selectMailboxByRole });
  sendActionsRef.current = { openDraftById, selectMailboxByRole };

  function sendInBackground(job: BackgroundSendJob) {
    startBackgroundSend(job, {
      onSettled: () => setRefreshVersion((value) => value + 1),
      onOpenDraft: (draftId) => sendActionsRef.current.openDraftById(draftId),
      onOpenSent: () => sendActionsRef.current.selectMailboxByRole("sent"),
    });
    closeComposeDialog();
    selectMailboxByRole("inbox");
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
    if (localPreview) {
      const sampleDetail = initialDetails?.[emailId];
      if (!sampleDetail) return;
      setManualRefreshTarget(null);
      restoreMessageFocus.current = true;
      setActionError(null);
      setOfflineSaveError(null);
      lastOpenedMessageIdRef.current = emailId;
      setDetailLoading(false);
      setDetailError(null);
      setReadUpdateError(false);
      setEmailDetail(sampleDetail);
      setOpenEmailId(emailId);
      return;
    }
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
    if (localPreview) {
      const sampleThread = initialThreads?.[threadId];
      if (!sampleThread) return;
      setManualRefreshTarget(null);
      restoreMessageFocus.current = false;
      restoreThreadFocus.current = true;
      lastOpenedThreadIdRef.current = threadId;
      setOpenEmailId(null);
      setActionError(null);
      setEmailDetail(null);
      setOpenThreadId(threadId);
      setThreadLoading(false);
      setThreadView(sampleThread);
      setThreadError(null);
      return;
    }
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
    if (localPreview) return;
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
    if (localPreview) return;
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
    if (localPreview) return;
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

  useSessionGuard({
    enabled: !localPreview && !isComposeOpen,
    expired: actionSessionEnded ||
      error === "sign_in_required" ||
      detailError === "sign_in_required" ||
      threadError === "sign_in_required",
  });

  const selectableMessages = listing?.messages.filter((message) => !message.isDraft) ?? [];
  const selectedCount = selectableMessages.filter((message) => selectedThreadIds.has(message.threadId)).length;
  const allPageSelected = selectableMessages.length > 0 && selectedCount === selectableMessages.length;
  const displayAccount = accountName?.trim() || accountEmail?.trim() || "rekad account";
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

  return (
    <main className={`mail-shell${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
      <header className="workspace-header">
          <a className="mail-brand" href="/" aria-label="rekad Mail home">
            <Image
              alt=""
              className="brand-image"
              height={836}
              priority
              src="/logo.png"
              width={824}
            />
            <span className="brand-wordmark">rekad</span>
            <span className="brand-name">Mail</span>
          </a>
        <MailSearch
          inputRef={searchInputRef}
          onChange={(value) => { setSearchInput(value); if (value.trim()) { showMail(); setFavorites(false); } }}
          filters={searchFilters}
          onFiltersChange={(filters) => { showMail(); setPosition(0); setFavorites(false); setSearchFilters(filters); }}
          messages={listing?.messages ?? []}
          loading={isLoading || searchInput.trim() !== searchText}
          error={Boolean(error)}
          canFilter={!localPreview}
          canFromMe={Boolean(accountEmail)}
          accountKey={`${accountEmail ?? "preview"}:${sharedAccountId ?? "personal"}`}
          canOpen={(message) => !localPreview || Boolean(initialDetails?.[message.id])}
          onOpen={(message) => {
            if (localPreview && !initialDetails?.[message.id]) return;
            showMail();
            if (message.isDraft) openSavedDraft(message.id, undefined, message.subject);
            else { openThread(message.threadId); openMessage(message.id); }
          }}
          value={searchInput}
        />

          <div className="mail-header-account">
            <Button className="refresh-button" disabled={localPreview || currentViewLoading} aria-busy={currentViewLoading}
              onClick={refresh} aria-label={refreshLabel} size="icon" variant="ghost"
              title={refreshLabel}><MailIcon name="refresh" size={18} /></Button>
            <Button className="header-notification" disabled={localPreview || !notificationsSupported || !notificationsReady}
              aria-label={notificationsEnabled ? "Turn off new mail alerts" : "Enable new mail alerts"}
              aria-pressed={notificationsEnabled} onClick={() => void toggleNewMailNotifications()} size="icon" variant="ghost"
              title={!notificationsSupported ? "Browser notifications are unavailable" : notificationsEnabled ? "New mail alerts are enabled" : "Enable new mail alerts"}>
              <MailIcon name="bell" size={18} />
            </Button>
            <span className="header-divider" />
            {localPreview ? (
              <span className="local-preview-account-label">Local preview</span>
            ) : (
              <AccountMenu accountEmail={accountEmail} displayAccount={displayAccount} pictureVersion={pictureVersion} />
            )}
            {notificationStatus ? <span className="visually-hidden" role="status">{notificationStatus}</span> : null}
          </div>
      </header>
      <aside className="mail-sidebar" aria-label="Mail navigation">
        <Button className="sidebar-compose" disabled={!listing || isLoading || (isComposeOpen && !isComposeMinimized)} size="lg"
          onClick={(event) => openCompose("new", undefined, undefined, event.currentTarget)} ref={composeButtonRef}
          aria-label="Compose" aria-controls={isComposeOpen ? "compose-content" : undefined}>
          <MailIcon name="plus" size={18} />
          Compose
        </Button>

        <div className="sidebar-navigation">
        <SharedAccountNav
          accounts={sharedAccounts}
          onSelect={(id) => requestMailboxNavigation(() => { showMail(); selectSharedAccount(id); })}
          selectedAccountId={sharedAccountId}
        />
        <MailboxNav
          isLoading={isLoading}
          localPreview={localPreview}
          mailboxes={mailboxes}
          onSelect={(id) => requestMailboxNavigation(() => { showMail(); selectMailbox(id); })}
          selectedMailboxId={favorites || showSettings ? undefined : mailboxId ?? undefined}
        />

        <Button aria-pressed={favorites && !showSettings} className={`mailbox-link${favorites && !showSettings ? " is-selected" : ""}`} disabled={localPreview} onClick={() => requestMailboxNavigation(() => { showMail(); selectFavorites(); })} variant="ghost">
          <MailIcon name="star" /><span className="mailbox-name">Favorites</span>
        </Button>
        <Button asChild className={`settings-link mailbox-link${showSettings ? " is-selected" : ""}`} variant="ghost">
          <a aria-current={showSettings ? "page" : undefined} href="/settings" onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); requestMailboxNavigation(openSettings); } }}><MailIcon name="settings" /><span className="mailbox-name">Settings</span></a>
        </Button>
        </div>
        <div className="sidebar-rail">
          <Button className="sidebar-collapse" size="icon" variant="ghost"
            aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed((value) => !value)}>
            <MailIcon name="sidebar" size={19} />
          </Button>
        </div>
        <div className="sidebar-footer">
          <ProfileAvatar className="account-avatar" name={displayAccount} version={pictureVersion} />
          <span className="sidebar-account-copy"><strong>{displayAccount}</strong><span>{accountEmail || "Signed in to rekad Mail"}</span></span>
        </div>
      </aside>

      <section className="mail-content" aria-labelledby="mail-title">
        <header className="mail-header">
          <div className="mail-header-navigation">
            <div className="mail-breadcrumb"><span className="reference-heading-icon">{showSettings ? <MailIcon name="settings" size={16} /> : <img src="/figma-mail/mail.svg" alt="" />}</span>
              <h1 id="mail-title" ref={mailTitleRef} tabIndex={-1}>{showSettings ? "Settings" : "Mails"}</h1>
            </div>
          </div>
          <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
            {!openEmailId && !openThreadId ? listStatus : ""}
          </span>

        </header>

        {localPreview ? (
          <p className="local-preview-notice" role="note">
            Local preview · sample conversations only · no mailbox access or actions
          </p>
        ) : null}

        {showSettings ? (
          <SettingsView accountName={displayAccount} pictureVersion={pictureVersion} pictureAvailable={profilePictureAvailable} onPictureChange={setPictureVersion} />
        ) : <>
        <div className={`mail-workspace${openThreadId || openEmailId ? " has-open-message" : ""}`}>
        <section className="conversation-pane" aria-label="Message list">
          <h2 className="visually-hidden">{searchText || searchFilters.hasAttachment || searchFilters.recent || searchFilters.fromMe ? "Search results" : favorites ? "Favorites" : selectedMailbox?.name ?? "Inbox"}</h2>
        {listing ? (
          <BulkToolbar
            actionPending={actionPending}
            archiveAvailable={archiveAvailable}
            isLoading={isLoading}
            localPreview={localPreview}
            mailboxes={listing.mailboxes}
            onAction={(action) => void performSelectedMailAction(action)}
            onMove={(mailboxId) => void performSelectedMailAction("move", mailboxId)}
            onSelectAll={(checked) => setSelectedThreadIds(checked ? new Set(selectableMessages.map((message) => message.threadId)) : new Set())}
            selectableCount={selectableMessages.length}
            selectedCount={selectedCount}
            statusText={pageRange}
            canPrevious={!localPreview && !openEmailId && !openThreadId && position > 0 && !isLoading && !actionPending}
            canNext={!localPreview && !openEmailId && !openThreadId && Boolean(listing.hasMore) && !isLoading && !actionPending}
            onPrevious={() => changePage(Math.max(0, position - PAGE_SIZE))}
            onNext={() => changePage(position + PAGE_SIZE)}
            trashAvailable={trashAvailable}
          />
        ) : null}

        {!openEmailId && !openThreadId && error ? (
          <div className="mail-alert" role="alert">
            <p>{errorMessage(error)}</p>
            {error !== "sign_in_required" ? (
              <Button onClick={refresh} size="sm" variant="outline">
                Try again
              </Button>
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
            <Button onClick={refresh} size="sm" variant="outline">
              Try again
            </Button>
          </div>
        ) : null}

        {!openEmailId && !openThreadId && listing && listing.messages.length === 0 && !isLoading && !error ? (
          <div className="empty-state">
            <span className="empty-envelope" aria-hidden="true">
              <svg viewBox="0 0 32 24" focusable="false">
                <path d="M2.5 3.5h27v17h-27zM3 4l13 10L29 4" />
              </svg>
            </span>
            <h2>{searchText || searchFilters.hasAttachment || searchFilters.recent || searchFilters.fromMe ? "No conversations found" : position === 0 ? favorites ? "No favorites yet" : "This mailbox is empty" : "No conversations on this page"}</h2>
            <p>
              {searchText || searchFilters.hasAttachment || searchFilters.recent || searchFilters.fromMe
                ? "Try another search."
                : position === 0
                ? favorites ? "Star a message to find it here." : "New messages will appear here."
                : "Go to the previous page or refresh to check again."}
            </p>
          </div>
        ) : null}

        {listing && listing.messages.length > 0 ? (
          <ConversationList
            actionPending={actionPending}
            archiveAvailable={archiveAvailable}
            canOpen={(message) => Boolean(initialThreads?.[message.threadId])}
            isLoading={isLoading}
            localPreview={localPreview}
            mailboxes={listing.mailboxes}
            messages={listing.messages}
            onAction={(action, threadId) => void performMailAction(action, { threadId })}
            onMove={(threadId, mailboxId) => void performMailAction("move", { threadId }, mailboxId)}
            onOpenConversation={(message) => { openThread(message.threadId); openMessage(message.id); }}
            onOpenDraft={(message, trigger) => openSavedDraft(message.id, trigger, message.subject)}
            onToggleSelect={(threadId, selected) => setSelectedThreadIds((current) => {
              const next = new Set(current);
              if (selected) next.add(threadId); else next.delete(threadId);
              return next;
            })}
            openThreadId={openThreadId}
            previewId={previewId}
            selectedThreadIds={selectedThreadIds}
            trashAvailable={trashAvailable}
          />
        ) : null}

        </section>
        <section className="reading-pane" aria-label="Reading pane">
        {openThreadId && !openEmailId ? (
          <ConversationThread
            actionError={actionError}
            actionPending={actionPending}
            backButtonRef={threadBackButtonRef}
            hasError={Boolean(threadError)}
            isLoading={threadLoading}
            isRefreshing={manualRefreshTarget === "thread"}
            localPreview={localPreview}
            mailboxName={selectedMailbox?.name ?? "mail"}
            mailboxes={listing?.mailboxes ?? []}
            onAction={(action, target) => void performMailAction(action, target)}
            onBack={closeThread}
            onMove={(target, mailboxId) => void performMailAction("move", target, mailboxId)}
            onOpenDraft={openSavedDraft}
            onOpenMessage={openMessage}
            onRetry={() => setThreadRefreshVersion((value) => value + 1)}
            previewId={previewId}
            threadId={openThreadId}
            threadView={threadView}
          />
        ) : null}

        {openEmailId ? (
          <MessageDetailView
            key={openEmailId}
            accountId={sharedAccountId}
            allowOriginal={!localPreview}
            backButtonRef={detailBackButtonRef}
            headingRef={detailHeadingRef}
            detail={emailDetail}
            error={detailError}
            isLoading={detailLoading}
            isRefreshing={manualRefreshTarget === "message"}
            mailboxName="conversation"
            onBack={closeMessage}
            onClose={closeThread}
            onRetry={refresh}
            readUpdateError={readUpdateError}
            mailboxes={listing?.mailboxes ?? []}
            actionPending={actionPending}
            actionError={actionError}
            offlineAvailable={OFFLINE_COPIES_ENABLED && offlineReady && Boolean(offlineScope)}
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

        </section>
        </div>

        {!openEmailId && !openThreadId && actionError ? (
          <p className="mail-alert" role="alert">{actionError}</p>
        ) : null}

        {!openEmailId && !openThreadId && listing && error ? (
          <p className="stale-list-note">Showing the last successfully loaded page.</p>
        ) : null}
        </>}
      </section>
      {isComposeOpen ? (
        <ComposeDialog
          key={composeInstance}
          mailboxNavigationId={pendingMailboxNavigation?.id ?? null}
          onMailboxNavigationReady={() => { const action = pendingMailboxNavigation?.action; setPendingMailboxNavigation(null); closeComposeDialog(); action?.(); }}
          onMailboxNavigationSettled={() => setPendingMailboxNavigation(null)}
          pendingRequestLabel={pendingComposeRequest?.label ?? null}
          onCancelSwitch={() => setPendingComposeRequest(null)}
          onConfirmSwitch={() => { if (pendingComposeRequest) startComposeRequest(pendingComposeRequest); }}
          isMinimized={isComposeMinimized}
          onMinimizedChange={setIsComposeMinimized}
          fallbackFocusRef={mailTitleRef}
          onClose={closeComposeDialog}
          onSend={sendInBackground}
          triggerRef={composeTriggerRef}
          mode={composeMode}
          initialDraftId={composeDraftId}
          initialFields={composeSeed}
          initialReplyHeaders={composeReplyHeaders}
          localPreview={localPreview}
        />
      ) : null}
    </main>
  );
}
