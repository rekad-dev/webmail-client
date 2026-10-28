"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

function describe(href: string): { kind: "web" | "email" | "invalid"; host: string } {
  try {
    const url = new URL(href);
    if (url.protocol === "mailto:") return { kind: "email", host: decodeURIComponent(url.pathname) };
    if (url.protocol === "https:" || url.protocol === "http:") return { kind: "web", host: url.hostname };
  } catch {
    // Fall through to invalid.
  }
  return { kind: "invalid", host: "" };
}

/** Asks before a link in a message opens, and shows where it really goes. */
export function ExternalLinkDialog({
  href,
  onClose,
}: {
  href: string | null;
  onClose(): void;
}) {
  const target = href ? describe(href) : null;

  function open() {
    if (!href || !target || target.kind === "invalid") return;
    if (target.kind === "email") window.location.assign(href);
    else window.open(href, "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <AlertDialog open={Boolean(href)} onOpenChange={(next) => { if (!next) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{target?.kind === "email" ? "Write to this address?" : "Open this link?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {target?.kind === "email"
              ? "This opens your email app with a new message to:"
              : "This leaves rekad Mail. Only continue if you trust the sender and the destination:"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {target && target.kind !== "invalid" && href ? (
          <div className="rounded-md border bg-muted p-3 text-sm">
            <p className="font-bold break-all">{target.host}</p>
            {target.kind === "web" ? <p className="mt-1 break-all text-muted-foreground">{href}</p> : null}
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button onClick={open}>{target?.kind === "email" ? "Write message" : "Open link"}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
