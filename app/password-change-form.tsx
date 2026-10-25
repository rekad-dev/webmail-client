"use client";

import { useRef, useState, type FormEvent } from "react";

type PasswordChangeError =
  | "origin_not_allowed"
  | "invalid_request"
  | "request_too_large"
  | "sign_in_required"
  | "password_change_unavailable"
  | "password_change_rejected"
  | "password_change_outcome_unknown"
  | "mail_unavailable";

function errorMessage(error: PasswordChangeError | null): string {
  switch (error) {
    case "sign_in_required":
      return "Your session expired. Sign in again before changing your password.";
    case "password_change_unavailable":
      return "This account can’t change its password here. Contact your mail administrator or password provider.";
    case "password_change_rejected":
      return "The current password, one-time code, or password rules were not accepted. Check them and try again.";
    case "password_change_outcome_unknown":
      return "The server didn’t confirm the result. Sign out and check whether the new password works before trying again.";
    case "invalid_request":
    case "request_too_large":
      return "Check the password fields and try again.";
    case "origin_not_allowed":
    case "mail_unavailable":
    default:
      return "The password could not be changed right now. Please try again.";
  }
}

function isPasswordChangeError(value: unknown): value is PasswordChangeError {
  return value === "origin_not_allowed" ||
    value === "invalid_request" ||
    value === "request_too_large" ||
    value === "sign_in_required" ||
    value === "password_change_unavailable" ||
    value === "password_change_rejected" ||
    value === "password_change_outcome_unknown" ||
    value === "mail_unavailable";
}

export function PasswordChangeForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<PasswordChangeError | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = data.get("currentPassword");
    const newPassword = data.get("newPassword");
    const confirmPassword = data.get("confirmPassword");
    const otpCode = data.get("otpCode");
    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      typeof confirmPassword !== "string" ||
      (otpCode !== null && typeof otpCode !== "string")
    ) {
      setError("invalid_request");
      setSuccess(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("invalid_request");
      setSuccess(false);
      return;
    }

    setIsPending(true);
    setError(null);
    setSuccess(false);
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          ...(otpCode ? { otpCode } : {}),
        }),
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      const responseBody = body && typeof body === "object" && !Array.isArray(body)
        ? body as Record<string, unknown>
        : null;
      if (response.ok && responseBody?.ok === true) {
        form.reset();
        setSuccess(true);
        return;
      }

      const responseError = responseBody?.error;
      const safeError = isPasswordChangeError(responseError)
        ? responseError
        : response.status >= 500
          ? "password_change_outcome_unknown"
          : "mail_unavailable";
      if (safeError === "password_change_outcome_unknown") form.reset();
      setError(safeError);
    } catch {
      form.reset();
      setError("password_change_outcome_unknown");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form className="password-change-form" onSubmit={(event) => void handleSubmit(event)} ref={formRef}>
      <h2>Change password</h2>
      <fieldset className="password-change-fields" disabled={isPending}>
        <label className="password-change-field">
          <span>Current password</span>
          <input
            autoComplete="current-password"
            name="currentPassword"
            required
            type="password"
          />
        </label>
        <label className="password-change-field">
          <span>New password</span>
          <input
            autoComplete="new-password"
            name="newPassword"
            required
            type="password"
          />
        </label>
        <label className="password-change-field">
          <span>Confirm new password</span>
          <input
            autoComplete="new-password"
            name="confirmPassword"
            required
            type="password"
          />
        </label>
        <label className="password-change-field">
          <span>One-time code <span className="password-change-optional">optional</span></span>
          <input
            autoComplete="one-time-code"
            inputMode="numeric"
            name="otpCode"
            type="text"
          />
        </label>
      </fieldset>
      <p className="password-change-hint">Enter a code if your account requires one. Password rules are set by your mail provider.</p>
      {error ? <p className="password-change-message is-error" role="alert">{errorMessage(error)}</p> : null}
      {success ? <p className="password-change-message is-success" role="status">Password updated.</p> : null}
      <button className="password-change-submit" disabled={isPending} type="submit">
        {isPending ? "Updating password…" : "Update password"}
      </button>
    </form>
  );
}
