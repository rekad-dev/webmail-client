"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function profileInitial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() || "r";
}

/** The signed-in person's picture, or their initial when none is set. */
export function ProfileAvatar({
  name,
  version,
  className,
}: {
  name: string;
  /** Changes whenever the picture changes; null means there is no picture. */
  version: number | null;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-9", className)}>
      {version !== null ? (
        <AvatarImage alt="" src={`/api/profile/picture?v=${version}`} />
      ) : null}
      <AvatarFallback className="bg-secondary text-sm font-bold text-secondary-foreground">
        {profileInitial(name)}
      </AvatarFallback>
    </Avatar>
  );
}
