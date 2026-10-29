"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { pictureUrl } from "./picture-directory";

export function profileInitial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() || "r";
}

/** The signed-in person's picture, or their initial when none is set. */
export function ProfileAvatar({
  name,
  version,
  address,
  className,
  fallbackClassName,
}: {
  name: string;
  /** Changes whenever the picture changes; null means there is no picture. */
  version: number | null;
  /** A colleague's address; their picture is then fetched by address instead of being the signed-in person's own. */
  address?: string | null;
  className?: string;
  fallbackClassName?: string;
}) {
  return (
    <Avatar className={cn("size-9", className)}>
      {version !== null ? (
        <AvatarImage alt="" src={address ? pictureUrl(address, version) : `/api/profile/picture?v=${version}`} />
      ) : null}
      <AvatarFallback className={cn("bg-secondary text-sm font-bold text-secondary-foreground", fallbackClassName)}>
        {profileInitial(name)}
      </AvatarFallback>
    </Avatar>
  );
}
