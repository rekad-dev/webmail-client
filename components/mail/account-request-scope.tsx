"use client";

import { useEffect } from "react";

const HEADER = "x-rekad-account";
const CHANNEL = "rekad-account";
const SCOPED_PREFIXES = ["/api/mail", "/api/profile", "/api/account"];

function requestPath(input: RequestInfo | URL): string | null {
  try {
    const url = new URL(input instanceof Request ? input.url : input.toString(), window.location.origin);
    return url.origin === window.location.origin ? url.pathname : null;
  } catch {
    return null;
  }
}

/** Tells other open tabs that the account in this browser changed, so they reload. */
export function announceAccountChange() {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage("changed");
    channel.close();
  } catch {
    // Tabs also recheck when they become visible.
  }
}

/**
 * Tags this tab's mail requests with the account it was loaded for. The server
 * refuses a request whose account no longer matches the browser's cookie, so a
 * tab left open across an account switch can never act as the new account.
 * It also reloads when another tab switches accounts.
 */
export function AccountRequestScope({ handle }: { handle: string }) {
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = (input, init) => {
      const path = requestPath(input);
      if (!path || !SCOPED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
        return originalFetch(input, init);
      }
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set(HEADER, handle);
      return originalFetch(input, { ...init, headers });
    };

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = () => window.location.reload();
    } catch {
      channel = null;
    }
    return () => {
      window.fetch = originalFetch;
      channel?.close();
    };
  }, [handle]);

  return null;
}
