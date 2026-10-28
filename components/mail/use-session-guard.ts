"use client";

import { useCallback, useEffect, useRef } from "react";
import { signOut } from "next-auth/react";
import { clearAllOfflineMail } from "@/lib/offline/mail-cache.mts";

const CHECK_INTERVAL_MS = 2 * 60_000;

/**
 * Ends a session the server no longer accepts: clears this browser's offline
 * copies (as a manual sign-out does), clears the cookie, and returns to the
 * sign-in page. The redirect happens even when cleanup fails, because the
 * server already refuses the session.
 */
async function leaveExpiredSession(): Promise<void> {
  try {
    await clearAllOfflineMail();
  } catch {
    // Storage may be unavailable; the session is already invalid.
  }
  try {
    await signOut({ redirect: false });
  } catch {
    // The sign-in page treats an expired cookie as signed out.
  }
  window.location.assign("/");
}

/**
 * Signs the user out when the server reports no session. It reacts to a known
 * "sign_in_required" result (`expired`) and re-checks every two minutes and
 * whenever the tab becomes visible or the browser comes back online. While
 * `enabled` is false, for example with an unsent message open, nothing happens.
 */
export function useSessionGuard({ enabled, expired }: { enabled: boolean; expired: boolean }) {
  const ending = useRef(false);

  const end = useCallback(() => {
    if (ending.current) return;
    ending.current = true;
    void leaveExpiredSession();
  }, []);

  useEffect(() => {
    if (enabled && expired) end();
  }, [enabled, expired, end]);

  useEffect(() => {
    if (!enabled) return;
    async function check() {
      try {
        const response = await fetch("/api/auth/status", {
          cache: "no-store",
          credentials: "same-origin",
          headers: { accept: "application/json" },
        });
        if (response.status === 401) end();
      } catch {
        // Offline or unreachable: keep the session and try again later.
      }
    }
    function onVisible() {
      if (document.visibilityState === "visible") void check();
    }
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [enabled, end]);
}
