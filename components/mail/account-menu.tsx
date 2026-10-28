"use client";

import { useCallback, useEffect, useState } from "react";
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

  const loadAccounts = useCallback(async (withLabels = true) => {
    try {
      const response = await fetch(withLabels ? "/api/account/linked" : "/api/account/linked?labels=0", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!response.ok) return;
      const body: unknown = await response.json();
      const list = (body as { accounts?: unknown })?.accounts;
      if (!Array.isArray(list)) return;
      setAccounts(
        list.flatMap((item): LinkedAccount[] =>
          item && typeof item.handle === "string" && typeof item.label === "string"
            ? [{ handle: item.handle, label: item.label, active: item.active === true }]
            : [],
        ),
      );
      setCanAdd((body as { canAdd?: unknown }).canAdd === true);
    } catch {
      // The menu still offers sign out when the account list is unavailable.
    }
  }, []);

  // Finishes linking an account added in this browser even if the menu is never opened.
  useEffect(() => {
    void loadAccounts(false);
  }, [loadAccounts]);

  async function switchTo(handle: string) {
    setPending(true);
    setMessage(null);
    try {
      const response = await postAccount("/api/account/switch", { handle });
      if (!response.ok) throw new Error("switch_failed");
      announceAccountChange();
      window.location.assign("/");
    } catch {
      setMessage("That account could not be opened. Sign in to it again.");
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
        <Button className="account-trigger" variant="ghost">
          <ProfileAvatar className="size-7" name={displayAccount} version={pictureVersion} />
          <span>{displayAccount}</span>
          <MailIcon name="chevron-down" size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid max-h-[80vh] w-80 gap-3 overflow-y-auto p-4">
        <p className="text-sm break-all text-muted-foreground">{accountEmail || "Signed in to rekad Mail"}</p>
        {accounts.length > 1 ? (
          <ul aria-label="Signed-in accounts" className="grid gap-1">
            {accounts.map((account) => (
              <li key={account.handle}>
                <Button
                  aria-current={account.active ? "true" : undefined}
                  className="w-full justify-start"
                  disabled={pending || account.active}
                  onClick={() => void switchTo(account.handle)}
                  variant={account.active ? "secondary" : "ghost"}
                >
                  <span className="truncate">{account.label}</span>
                  {account.active ? <span className="visually-hidden"> (current)</span> : null}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {canAdd ? (
          <Button disabled={pending} onClick={() => void addAccount()} variant="outline">
            <MailIcon name="plus" size={16} /> Add account
          </Button>
        ) : null}
        <SignOutButton />
        {accounts.length > 1 ? (
          <Button disabled={pending} onClick={() => void signOutEverywhere()} variant="ghost">
            Sign out of all accounts
          </Button>
        ) : null}
        {message ? <p className="sign-out-error" role="alert">{message}</p> : null}
      </PopoverContent>
    </Popover>
  );
}
