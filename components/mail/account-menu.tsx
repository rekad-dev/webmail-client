"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { signIn } from "next-auth/react";

import { MailIcon } from "@/app/mail-icons";
import { SignOutButton } from "@/app/sign-out-button";
import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { clearAllOfflineMail } from "@/lib/offline/mail-cache.mts";
import { announceAccountChange } from "./account-request-scope";

interface LinkedAccount {
  handle: string;
  label: string;
  active: boolean;
  lapsed: boolean;
  pictureAddress: string | null;
  pictureVersion: number | null;
}

const JSON_HEADERS = { accept: "application/json", "content-type": "application/json" };

async function postAccount(path: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(path, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export function AccountMenu({
  displayAccount,
  accountEmail,
  pictureVersion,
}: {
  displayAccount: string;
  accountEmail?: string | null;
  pictureVersion: number | null;
}) {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [canAdd, setCanAdd] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [accountsError, setAccountsError] = useState(false);
  // The handle being opened right now; its row shows progress before the server answers.
  const [switchingHandle, setSwitchingHandle] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const loadAccounts = useCallback(async (withLabels = true) => {
    const version = ++requestVersion.current;
    if (withLabels) {
      setLoadingAccounts(true);
      setAccountsError(false);
    }
    try {
      const response = await fetch(withLabels ? "/api/account/linked" : "/api/account/linked?labels=0", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("accounts_unavailable");
      const body: unknown = await response.json();
      const list = (body as { accounts?: unknown })?.accounts;
      if (!Array.isArray(list)) throw new Error("accounts_unavailable");
      if (version !== requestVersion.current) return;
      setAccounts(
        list.flatMap((item): LinkedAccount[] =>
          item && typeof item.handle === "string" && typeof item.label === "string"
            ? [{
              handle: item.handle,
              label: item.label,
              active: item.active === true,
              lapsed: item.lapsed === true,
              pictureAddress: typeof item.pictureAddress === "string" ? item.pictureAddress : null,
              pictureVersion: typeof item.pictureVersion === "number" ? item.pictureVersion : null,
            }]
            : [],
        ),
      );
      setCanAdd((body as { canAdd?: unknown }).canAdd === true);
    } catch {
      if (withLabels && version === requestVersion.current) setAccountsError(true);
    } finally {
      if (withLabels && version === requestVersion.current) setLoadingAccounts(false);
    }
  }, []);

  // Finishes linking an account added in this browser even if the menu is never opened.
  useEffect(() => {
    void loadAccounts(false);
  }, [loadAccounts]);

  async function switchTo(handle: string) {
    setPending(true);
    setSwitchingHandle(handle);
    setMessage(null);
    try {
      const response = await postAccount("/api/account/switch", { handle });
      if (!response.ok) throw new Error("switch_failed");
      announceAccountChange();
      window.location.assign("/");
    } catch {
      setMessage("That account could not be opened. Sign in to it again.");
      setSwitchingHandle(null);
      setPending(false);
      void loadAccounts();
    }
  }

  async function addAccount() {
    setPending(true);
    setMessage(null);
    try {
      const response = await postAccount("/api/account/add", {});
      if (!response.ok) throw new Error("add_failed");
      // The new sign-in replaces this tab's cookie; other tabs reload when it finishes.
      await signIn("stalwart", { redirectTo: "/" }, { prompt: "login" });
    } catch {
      setMessage("Another account could not be added. Try again.");
      setPending(false);
    }
  }

  async function signOutEverywhere() {
    setPending(true);
    setMessage(null);
    try {
      await clearAllOfflineMail().catch(() => undefined);
      const response = await postAccount("/api/account/remove", { all: true });
      if (!response.ok) throw new Error("sign_out_failed");
      announceAccountChange();
      window.location.assign("/");
    } catch {
      setMessage("Sign out failed. Please try again.");
      setPending(false);
    }
  }

  return (
    <Popover onOpenChange={(open) => { if (open) void loadAccounts(); }}>
      <PopoverTrigger asChild>
        <Button aria-label={`Account menu for ${displayAccount}`} className="account-trigger p-1" size="icon" variant="ghost">
          <ProfileAvatar className="account-trigger-avatar size-9 rounded-md" fallbackClassName="rounded-md" name={displayAccount} version={pictureVersion} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} aria-label="Account menu" className="account-switcher w-[min(320px,calc(100vw-24px))] rounded-xl p-2">
        <div className="account-switcher-identity">
          <UserRound className="account-switcher-profile-icon" aria-hidden="true" size={18} />
          <div className="account-switcher-details">
            <strong>Signed in</strong>
            <span>{accountEmail || displayAccount}</span>
          </div>
        </div>
        <div className="account-switcher-top-actions">
          <SignOutButton menuItem disabled={pending} onPendingChange={setPending} />
        </div>
        <div className="account-switcher-section">
          <p className="account-switcher-heading">Switch account</p>
          {/* Keep the existing list available while accounts refresh. */}
          {loadingAccounts && accounts.length === 0 ? <p className="account-switcher-status" role="status">Loading accounts…</p> : null}
          {accountsError ? <p className="account-switcher-status" role="status">Accounts could not be loaded. Open the menu again to retry.</p> : null}
          <ul aria-label="Signed-in accounts" aria-busy={loadingAccounts} className="account-switcher-list">
            {accounts.map((account) => (
              <li key={account.handle}>
                {account.active ? (
                  <div aria-current="true" className="account-switcher-row is-current">
                    <ProfileAvatar className="account-switcher-avatar size-10 rounded-md" fallbackClassName="rounded-md" name={displayAccount} version={pictureVersion} />
                    <span className="account-switcher-details"><strong>{displayAccount}</strong>{accountEmail && accountEmail !== displayAccount ? <span>{accountEmail}</span> : null}</span>
                    <span className="account-switcher-indicator" aria-hidden="true" />
                    <span className="visually-hidden">Current account</span>
                  </div>
                ) : account.lapsed ? (
                  <div aria-disabled="true" className="account-switcher-row is-logged-out">
                    <ProfileAvatar className="account-switcher-avatar size-10 rounded-md" fallbackClassName="rounded-md" name={account.label} version={null} />
                    <span className="account-switcher-details">
                      <strong>{account.label}</strong>
                      <span className="account-switcher-logged-out">Logged out</span>
                    </span>
                  </div>
                ) : (
                  <Button aria-label={`Switch to ${account.label}`} aria-busy={switchingHandle === account.handle || undefined} className="account-switcher-row h-auto justify-start px-2" disabled={pending} onClick={() => void switchTo(account.handle)} variant="ghost">
                    <ProfileAvatar address={account.pictureAddress} className="account-switcher-avatar size-10 rounded-md" fallbackClassName="rounded-md" name={account.label} version={account.pictureVersion} />
                    <span className="account-switcher-details">
                      <strong>{account.label}</strong>
                      {switchingHandle === account.handle ? <span className="account-switcher-opening">Opening…</span> : null}
                    </span>
                    {switchingHandle === account.handle ? <span className="account-switcher-spinner" aria-hidden="true" /> : <span className="account-switcher-indicator" aria-hidden="true" />}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {canAdd ? (
            <Button className="account-switcher-add justify-start px-2" disabled={pending} onClick={() => void addAccount()} variant="ghost">
              <MailIcon name="plus" size={18} /> Add account
            </Button>
          ) : null}
        </div>
        {accounts.length > 1 ? (
          <Button className="account-switcher-sign-out-all w-full bg-[#f7f7f7]" disabled={pending} onClick={() => void signOutEverywhere()} variant="ghost">
            <LogOut aria-hidden="true" size={18} /> Sign out of all accounts
          </Button>
        ) : null}
        {message ? <p className="sign-out-error" role="alert">{message}</p> : null}
      </PopoverContent>
    </Popover>
  );
}
