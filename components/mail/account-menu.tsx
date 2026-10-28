"use client";

import { MailIcon } from "@/app/mail-icons";
import { SignOutButton } from "@/app/sign-out-button";
import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function AccountMenu({
  displayAccount,
  accountEmail,
  pictureVersion,
}: {
  displayAccount: string;
  accountEmail?: string | null;
  pictureVersion: number | null;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="account-trigger" variant="ghost">
          <ProfileAvatar className="size-7" name={displayAccount} version={pictureVersion} />
          <span>{displayAccount}</span>
          <MailIcon name="chevron-down" size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid max-h-[80vh] w-80 gap-3 overflow-y-auto p-4">
        <p className="text-sm break-all text-muted-foreground">{accountEmail || "Signed in to rekad Mail"}</p>
        <a className="account-settings-link" href="/settings">Settings</a>
        <SignOutButton />
      </PopoverContent>
    </Popover>
  );
}
