"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

export function SignOutButton() {
  const [isPending, setIsPending] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function handleSignOut() {
    setIsPending(true);
    setHasError(false);

    try {
      const response = await signOut({ redirect: false, redirectTo: "/" });
      if (response.url) {
        window.location.assign(response.url);
        return;
      }
    } catch {
      // Keep the current page and session visible so the user can retry.
    }

    setHasError(true);
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
      {hasError ? (
        <p className="sign-out-error" role="alert">
          Sign out failed. Please try again.
        </p>
      ) : null}
    </div>
  );
}
