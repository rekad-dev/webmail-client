"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { clearAllOfflineMail } from "../lib/offline/mail-cache.mts";

export function SignOutButton() {
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSignOut() {
    setIsPending(true);
    setErrorMessage(null);

    try {
      await clearAllOfflineMail();
    } catch {
      setErrorMessage("Offline copies could not be cleared. Sign out is paused; check browser storage and retry.");
      setIsPending(false);
      return;
    }

    try {
      const response = await signOut({ redirect: false, redirectTo: "/" });
      if (response.url) {
        window.location.assign(response.url);
        return;
      }
    } catch {
      // Keep the current page and session visible so the user can retry.
    }

    setErrorMessage("Sign out failed. Please try again.");
    setIsPending(false);
  }

  return (
    <div className="auth-actions">
      <button
        aria-busy={isPending}
        className="sign-out-button"
        disabled={isPending}
        onClick={() => void handleSignOut()}
        type="button"
      >
        {isPending ? "Signing out…" : "Sign out"}
      </button>
      {errorMessage ? (
        <p className="sign-out-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
