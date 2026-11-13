"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  commitOfflineNotificationChanges,
  getOfflineNotificationState,
  setOfflineNotificationsEnabled,
} from "@/lib/offline/mail-cache.mts";
import { planOfflineNotificationCommit, type OfflineNotificationState } from "@/lib/offline/mail-cache-model.mts";
import {
  formatMailNotificationContent,
  parseInboxChangesBody,
  type InboxChangesBody,
} from "./notification-helpers";

const POLL_INTERVAL_MS = 60_000;
const STREAM_RECONNECT_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];
const STREAM_STATE_DEBOUNCE_MS = 250;
const BROADCAST_CHANNEL_NAME = "rekad-mail-notifications";

export type NotificationTransport = "live" | "polling" | "offline";
export type NotificationPermissionState = NotificationPermission | "unsupported";

interface UseMailNotificationsOptions {
  localPreview: boolean;
  offlineScope: string | null;
  notificationsReady: boolean;
  initialEnabled: boolean;
  storageAvailable: boolean;
  onInboxChanged: () => void;
  onOpenTarget: (target: { emailId: string; threadId: string } | null) => void;
  onSessionEnded: () => void;
}

type BroadcastPayload =
  | { type: "inbox-changed"; cacheScope: string }
  | { type: "preference-changed"; cacheScope: string; enabled: boolean };

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
    const error =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : response.status === 401
          ? "sign_in_required"
          : "notification_sync_failed";
    throw new Error(error);
  }
  const parsed = parseInboxChangesBody(body, cacheScope);
  if (!parsed) throw new Error("notification_sync_failed");
  return parsed;
}

function readNotificationPermission(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export function useMailNotifications({
  localPreview,
  offlineScope,
  notificationsReady,
  initialEnabled,
  storageAvailable,
  onInboxChanged,
  onOpenTarget,
  onSessionEnded,
}: UseMailNotificationsOptions) {
  const [notificationsSupported, setNotificationsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermissionState>("unsupported");
  const [notificationsEnabled, setNotificationsEnabled] = useState(initialEnabled);
  const [notificationStatus, setNotificationStatus] = useState<string | null>(null);
  const [transport, setTransport] = useState<NotificationTransport>("polling");

  const memoryStateRef = useRef<Map<string, OfflineNotificationState>>(new Map());
  const pollRef = useRef<(() => void) | null>(null);
  const enabledRef = useRef(initialEnabled);
  const onInboxChangedRef = useRef(onInboxChanged);
  const onOpenTargetRef = useRef(onOpenTarget);
  const onSessionEndedRef = useRef(onSessionEnded);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    onInboxChangedRef.current = onInboxChanged;
  }, [onInboxChanged]);

  useEffect(() => {
    onOpenTargetRef.current = onOpenTarget;
  }, [onOpenTarget]);

  useEffect(() => {
    onSessionEndedRef.current = onSessionEnded;
  }, [onSessionEnded]);

  useEffect(() => {
    setNotificationsEnabled(initialEnabled);
    enabledRef.current = initialEnabled;
  }, [initialEnabled]);

  useEffect(() => {
    if (localPreview) return;
    const supported = typeof window !== "undefined" && "Notification" in window;
    setNotificationsSupported(supported);
    setPermission(readNotificationPermission());

    const syncPermission = () => setPermission(readNotificationPermission());
    document.addEventListener("visibilitychange", syncPermission);
    window.addEventListener("focus", syncPermission);
    return () => {
      document.removeEventListener("visibilitychange", syncPermission);
      window.removeEventListener("focus", syncPermission);
    };
  }, [localPreview]);

  const readState = useCallback(
    async (scope: string): Promise<OfflineNotificationState | null> => {
      if (storageAvailable) {
        try {
          return await getOfflineNotificationState(scope);
        } catch {
          // Fall back to in-memory state if IndexedDB becomes unavailable.
        }
      }
      return memoryStateRef.current.get(scope) ?? null;
    },
    [storageAvailable],
  );

  const commitChanges = useCallback(
    async (
      scope: string,
      expectedEmailState: string | null,
      nextEmailState: string,
      newEmailIds: string[],
    ): Promise<{ committed: boolean; notifyEmailIds: string[]; enabled: boolean }> => {
      if (storageAvailable) {
        try {
          return await commitOfflineNotificationChanges(
            scope,
            expectedEmailState,
            nextEmailState,
            newEmailIds,
          );
        } catch {
          // Fall back to in-memory cursor tracking if IndexedDB fails.
        }
      }
      const current = memoryStateRef.current.get(scope) ?? {
        cacheScope: scope,
        emailState: "",
        enabled: enabledRef.current,
        notifiedEmailIds: [],
        updatedAt: 0,
      };
      const plan = planOfflineNotificationCommit(
        scope,
        current.emailState ? current : null,
        expectedEmailState,
        nextEmailState,
        newEmailIds,
      );
      if (!plan.committed || !plan.state) {
        return { committed: false, notifyEmailIds: [], enabled: current.enabled };
      }
      plan.state.enabled = enabledRef.current;
      memoryStateRef.current.set(scope, plan.state);
      return {
        committed: true,
        notifyEmailIds: plan.notifyEmailIds,
        enabled: plan.state.enabled,
      };
    },
    [storageAvailable],
  );

  const persistEnabled = useCallback(
    async (scope: string, enabled: boolean): Promise<void> => {
      enabledRef.current = enabled;
      const existing = memoryStateRef.current.get(scope);
      memoryStateRef.current.set(scope, {
        cacheScope: scope,
        emailState: existing?.emailState ?? "",
        enabled,
        notifiedEmailIds: existing?.notifiedEmailIds ?? [],
        updatedAt: Date.now(),
      });
      if (storageAvailable) {
        await setOfflineNotificationsEnabled(scope, enabled);
      }
    },
    [storageAvailable],
  );

  useEffect(() => {
    if (localPreview || !offlineScope || !notificationsReady) return;
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const payload = event.data as Partial<BroadcastPayload> | null;
      if (!payload || payload.cacheScope !== offlineScope) return;
      if (payload.type === "inbox-changed") {
        onInboxChangedRef.current();
      } else if (
        payload.type === "preference-changed" &&
        typeof payload.enabled === "boolean"
      ) {
        enabledRef.current = payload.enabled;
        setNotificationsEnabled(payload.enabled);
      }
    };
    return () => {
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [localPreview, notificationsReady, offlineScope]);

  useEffect(() => {
    if (localPreview || !notificationsReady || !offlineScope) return;
    const scope = offlineScope;
    let active = true;
    let running = false;
    let sessionEnded = false;
    let streamUnsupported = false;
    let errorAttempts = 0;
    let eventSource: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let stateDebounceTimer: number | null = null;
    const controller = new AbortController();

    function clearTimers() {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (stateDebounceTimer !== null) {
        window.clearTimeout(stateDebounceTimer);
        stateDebounceTimer = null;
      }
    }

    function closeEventSource() {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    }

    function deliverAlerts(
      notifyEmailIds: string[],
      page: InboxChangesBody,
    ) {
      const formatted = formatMailNotificationContent(
        notifyEmailIds,
        page.newInboxMessages,
      );
      if (!formatted) return;

      const openTarget = () => {
        onOpenTargetRef.current(formatted.target);
      };

      const isFocusedVisible =
        document.visibilityState === "visible" && document.hasFocus();

      if (
        notificationsSupported &&
        Notification.permission === "granted" &&
        !isFocusedVisible
      ) {
        try {
          const browserNotification = new Notification(formatted.title, {
            body: formatted.body,
            tag: formatted.tag,
            icon: "/logo.png",
          });
          browserNotification.onclick = () => {
            browserNotification.close();
            try {
              window.focus();
            } catch {
              // Ignore focus errors in restricted contexts.
            }
            openTarget();
          };
        } catch {
          // Polling and list refresh continue when the browser blocks a notification.
        }
      }

      if (document.visibilityState === "visible") {
        toast(formatted.title, {
          description: formatted.body,
          duration: 6000,
          action: {
            label: formatted.target ? "Open" : "View Inbox",
            onClick: openTarget,
          },
        });
      }
    }

    async function pollInboxChanges() {
      if (
        running ||
        sessionEnded ||
        !navigator.onLine ||
        controller.signal.aborted
      ) {
        return;
      }
      running = true;
      try {
        const state = await readState(scope);
        let sinceState = state?.emailState || null;
        let sawInboxChanges = false;
        for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
          const page = await requestInboxChanges(scope, sinceState, controller.signal);
          const committed = await commitChanges(
            scope,
            sinceState,
            page.emailState,
            page.newInboxEmailIds,
          );
          if (!committed.committed) break;
          if (!active) return;
          if (page.hasInboxChanges) sawInboxChanges = true;
          if (committed.enabled && committed.notifyEmailIds.length > 0) {
            deliverAlerts(committed.notifyEmailIds, page);
          }
          sinceState = page.emailState;
          if (!page.hasMore) break;
        }
        if (sawInboxChanges) {
          onInboxChangedRef.current();
          channelRef.current?.postMessage({
            type: "inbox-changed",
            cacheScope: scope,
          } satisfies BroadcastPayload);
        }
        if (active) setNotificationStatus(null);
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        if (error instanceof Error && error.message === "sign_in_required") {
          sessionEnded = true;
          closeEventSource();
          clearTimers();
          onSessionEndedRef.current();
          return;
        }
        setNotificationStatus(
          "New mail checks are temporarily unavailable. Use Refresh to retry.",
        );
      } finally {
        running = false;
      }
    }

    function scheduleStreamConnect(delayMs: number) {
      if (!active || sessionEnded || streamUnsupported || !navigator.onLine) return;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connectEventSource();
      }, delayMs);
    }

    function connectEventSource() {
      if (
        !active ||
        sessionEnded ||
        streamUnsupported ||
        typeof EventSource === "undefined" ||
        !navigator.onLine
      ) {
        if (active) {
          setTransport(navigator.onLine ? "polling" : "offline");
        }
        return;
      }
      closeEventSource();
      const source = new EventSource("/api/mail/notifications/stream");
      eventSource = source;

      source.addEventListener("ready", () => {
        if (!active) return;
        errorAttempts = 0;
        setTransport("live");
      });

      source.addEventListener("state", () => {
        if (!active) return;
        errorAttempts = 0;
        setTransport("live");
        if (stateDebounceTimer !== null) window.clearTimeout(stateDebounceTimer);
        stateDebounceTimer = window.setTimeout(() => {
          stateDebounceTimer = null;
          void pollInboxChanges();
        }, STREAM_STATE_DEBOUNCE_MS);
      });

      source.addEventListener("reconnect", () => {
        if (!active) return;
        closeEventSource();
        scheduleStreamConnect(250);
      });

      source.addEventListener("unsupported", () => {
        if (!active) return;
        streamUnsupported = true;
        closeEventSource();
        setTransport("polling");
      });

      source.onerror = () => {
        if (!active) return;
        closeEventSource();
        if (!navigator.onLine) {
          setTransport("offline");
          return;
        }
        setTransport("polling");
        const delay =
          STREAM_RECONNECT_DELAYS_MS[
            Math.min(errorAttempts, STREAM_RECONNECT_DELAYS_MS.length - 1)
          ]!;
        errorAttempts += 1;
        scheduleStreamConnect(delay);
      };
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void pollInboxChanges();
        if (!eventSource && !streamUnsupported) {
          errorAttempts = 0;
          connectEventSource();
        }
      }
    };

    const onOnline = () => {
      setTransport("polling");
      void pollInboxChanges();
      if (!streamUnsupported) {
        errorAttempts = 0;
        connectEventSource();
      }
    };

    const onOffline = () => {
      closeEventSource();
      clearTimers();
      setTransport("offline");
    };

    pollRef.current = () => void pollInboxChanges();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => void pollInboxChanges(), POLL_INTERVAL_MS);

    void pollInboxChanges();
    connectEventSource();

    return () => {
      active = false;
      controller.abort();
      clearTimers();
      closeEventSource();
      window.clearInterval(interval);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      if (pollRef.current) pollRef.current = null;
    };
  }, [
    commitChanges,
    localPreview,
    notificationsReady,
    notificationsSupported,
    offlineScope,
    readState,
  ]);

  const toggleNotifications = useCallback(async () => {
    if (localPreview || !offlineScope || !notificationsReady) return;
    setNotificationStatus(null);
    try {
      if (notificationsEnabled) {
        await persistEnabled(offlineScope, false);
        setNotificationsEnabled(false);
        const message = "New mail alerts are off for this account.";
        setNotificationStatus(message);
        toast.info(message);
        channelRef.current?.postMessage({
          type: "preference-changed",
          cacheScope: offlineScope,
          enabled: false,
        } satisfies BroadcastPayload);
        return;
      }

      if (!notificationsSupported) {
        const message = "This browser does not support desktop notifications.";
        setNotificationStatus(message);
        toast.error(message);
        return;
      }

      let currentPermission = Notification.permission;
      if (currentPermission === "default") {
        currentPermission = await Notification.requestPermission();
      }
      setPermission(currentPermission);
      if (currentPermission !== "granted") {
        const message =
          currentPermission === "denied"
            ? "Notifications are blocked in browser settings."
            : "Notifications were not enabled.";
        setNotificationStatus(message);
        toast.error(message);
        return;
      }

      await persistEnabled(offlineScope, true);
      setNotificationsEnabled(true);
      const message = "New mail alerts are on for this account.";
      setNotificationStatus(message);
      toast.success(message);
      channelRef.current?.postMessage({
        type: "preference-changed",
        cacheScope: offlineScope,
        enabled: true,
      } satisfies BroadcastPayload);
    } catch {
      const message = "The notification preference could not be saved.";
      setNotificationStatus(message);
      toast.error(message);
    }
  }, [
    localPreview,
    notificationsEnabled,
    notificationsReady,
    notificationsSupported,
    offlineScope,
    persistEnabled,
  ]);

  const sendTestNotification = useCallback(() => {
    if (localPreview || !notificationsSupported) {
      toast.error("This browser does not support desktop notifications.");
      return;
    }
    const currentPermission = Notification.permission;
    setPermission(currentPermission);
    if (currentPermission !== "granted") {
      toast.error(
        currentPermission === "denied"
          ? "Notifications are blocked in browser settings."
          : "Enable new mail alerts first to test desktop notifications.",
      );
      return;
    }
    try {
      const testNotice = new Notification("rekad Mail", {
        body: "New mail alerts are active on this device.",
        tag: `rekad-test-notification-${Date.now()}`,
        icon: "/logo.png",
      });
      testNotice.onclick = () => {
        testNotice.close();
        try {
          window.focus();
        } catch {
          // Ignore focus errors in restricted contexts.
        }
      };
      toast.success("Test notification sent.");
    } catch {
      toast.error("Your browser blocked the test notification.");
    }
  }, [localPreview, notificationsSupported]);

  const pollNow = useCallback(() => {
    pollRef.current?.();
  }, []);

  return {
    notificationsReady,
    notificationsEnabled,
    notificationsSupported,
    notificationPermission: permission,
    notificationStatus,
    notificationTransport: transport,
    toggleNotifications,
    sendTestNotification,
    pollNow,
  };
}
