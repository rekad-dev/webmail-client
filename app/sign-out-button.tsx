"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearAllOfflineMail } from "../lib/offline/mail-cache.mts";
import { announceAccountChange } from "@/components/mail/account-request-scope";

export function SignOutButton({ menuItem = false, disabled = false, onPendingChange }: {
  menuItem?: boolean;
  disabled?: boolean;
  onPendingChange?(pending: boolean): void;
} = {}) {
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSignOut() {
    setIsPending(true);
    onPendingChange?.(true);
    setErrorMessage(null);

    try {
      await clearAllOfflineMail();
    } catch {
      setErrorMessage("Offline copies could not be cleared. Sign out is paused; check browser storage and retry.");
      setIsPending(false);
      onPendingChange?.(false);
      return;
    }

    try {
      // Revokes this account's session; the browser continues as another linked account, if any.
      const response = await fetch("/api/account/remove", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: "{}",
      });
      if (response.status === 409) {
        // This tab was opened for a different account than the browser now uses.
        window.location.reload();
        return;
      }
      if (response.ok) {
        announceAccountChange();
        window.location.assign("/");
        return;
      }
    } catch {
      // Keep the current page and session visible so the user can retry.
    }

    setErrorMessage("Sign out failed. Please try again.");
    setIsPending(false);
    onPendingChange?.(false);
  }

  return (
    <div className="auth-actions">
      <Button
        aria-busy={isPending}
        className={menuItem ? "sign-out-button account-sign-out justify-start border-0 bg-transparent shadow-none" : "sign-out-button"}
        disabled={disabled || isPending}
        onClick={() => void handleSignOut()}
        variant={menuItem ? "ghost" : "outline"}
      >
        {menuItem ? <LogOut aria-hidden="true" size={18} /> : null}
        {isPending ? "Signing out…" : "Sign out"}
      </Button>
      {errorMessage ? (
        <p className="sign-out-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
