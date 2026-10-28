"use client";

import { MailIcon } from "@/app/mail-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SharedAccount } from "./types";

/**
 * Group mailboxes the signed-in user can reach. They appear automatically
 * from the JMAP session; nothing here lets the user add an arbitrary account.
 */
export function SharedAccountNav({
  accounts,
  selectedAccountId,
  onSelect,
}: {
  accounts: SharedAccount[];
  selectedAccountId: string | null;
  onSelect(accountId: string | null): void;
}) {
  if (accounts.length === 0) return null;
  return (
    <nav aria-label="Mail accounts" className="mailbox-nav shared-account-nav">
      <Button
        aria-pressed={selectedAccountId === null}
        className={cn("mailbox-link", selectedAccountId === null && "is-selected")}
        onClick={() => onSelect(null)}
        variant="ghost"
      >
        <MailIcon name="mail" />
        <span className="mailbox-name">My mail</span>
      </Button>
      {accounts.map((account) => (
        <Button
          aria-pressed={selectedAccountId === account.id}
          className={cn("mailbox-link", selectedAccountId === account.id && "is-selected")}
          key={account.id}
          onClick={() => onSelect(account.id)}
          title={account.isReadOnly ? `${account.name} (read only)` : account.name}
          variant="ghost"
        >
          <MailIcon name="inbox" />
          <span className="mailbox-name">{account.name}</span>
          {account.isReadOnly ? <span className="mailbox-unread">read only</span> : null}
        </Button>
      ))}
    </nav>
  );
}
