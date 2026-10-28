"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { prepareProfilePicture } from "./crop";
import { ProfileAvatar } from "./profile-avatar";

function failureText(reason: string): string {
  switch (reason) {
    case "too_large":
      return "That file is too large. Choose an image under 10 MB.";
    case "unreadable":
      return "That file could not be read as an image. Use a PNG, JPEG, or WebP file.";
    case "sign_in_required":
      return "Your session has ended. Sign in again to change your picture.";
    default:
      return "The picture could not be saved. Try again in a moment.";
  }
}

async function responseReason(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // Keep the generic reason for non-JSON responses.
  }
  return "profile_unavailable";
}

export function ProfilePictureEditor({
  name,
  version,
  onChange,
}: {
  name: string;
  version: number | null;
  onChange(version: number | null): void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    setPending(true);
    setMessage(null);
    try {
      const blob = await prepareProfilePicture(file);
      const response = await fetch("/api/profile/picture", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": blob.type },
        body: blob,
      });
      if (!response.ok) throw new Error(await responseReason(response));
      const body: unknown = await response.json();
      const next = body && typeof body === "object" && "version" in body && typeof body.version === "number"
        ? body.version
        : Date.now();
      onChange(next);
      setMessage({ text: "Picture updated.", error: false });
    } catch (error) {
      setMessage({ text: failureText(error instanceof Error ? error.message : ""), error: true });
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/profile/picture", { method: "DELETE", credentials: "same-origin" });
      if (!response.ok) throw new Error(await responseReason(response));
      onChange(null);
      setMessage({ text: "Picture removed.", error: false });
    } catch (error) {
      setMessage({ text: failureText(error instanceof Error ? error.message : ""), error: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="profile-picture-heading" className="grid gap-3 border-b pb-4">
      <h2 className="text-sm font-bold" id="profile-picture-heading">Profile picture</h2>
      <div className="flex items-center gap-4">
        <ProfileAvatar className="size-16 text-xl" name={name} version={version} />
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} onClick={() => inputRef.current?.click()} size="sm" variant="outline">
            {pending ? "Saving…" : version === null ? "Add picture" : "Change picture"}
          </Button>
          {version !== null ? (
            <Button disabled={pending} onClick={() => void remove()} size="sm" variant="ghost">
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <input
        accept="image/png,image/jpeg,image/webp"
        aria-label="Choose a profile picture"
        className="sr-only"
        onChange={(event) => void choose(event.target.files?.[0])}
        ref={inputRef}
        tabIndex={-1}
        type="file"
      />
      <p className="text-xs text-muted-foreground">
        PNG, JPEG, or WebP. The picture is cropped to a square and shown only to you in rekad Mail.
      </p>
      {message ? (
        <p className={message.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role={message.error ? "alert" : "status"}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
