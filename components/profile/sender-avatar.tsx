"use client";

import { useState } from "react";

import { pictureUrl, usePictureVersion } from "./picture-directory";

/**
 * The round sender mark used in message lists. Colleagues who set a picture
 * show it; everyone else keeps the colored initials.
 */
export function SenderAvatar({
  address,
  initials,
  tone,
}: {
  address: string | null | undefined;
  initials: string;
  tone: number;
}) {
  const version = usePictureVersion(address);
  const [failedVersion, setFailedVersion] = useState<number | null>(null);
  const showPicture = typeof version === "number" && typeof address === "string" && failedVersion !== version;
  return (
    <span className={`message-avatar avatar-tone-${tone}${showPicture ? " has-picture" : ""}`} aria-hidden="true">
      {showPicture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="message-avatar-image"
          decoding="async"
          loading="lazy"
          onError={() => setFailedVersion(version)}
          referrerPolicy="no-referrer"
          src={pictureUrl(address.trim().toLowerCase(), version)}
        />
      ) : initials}
    </span>
  );
}
