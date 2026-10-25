import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { InboxClient } from "../inbox-client";
import { localPreviewListing } from "./sample-data";

function isLoopbackHost(host: string | null): boolean {
  if (!host) return false;
  const lowerHost = host.toLowerCase();
  const closingBracket = lowerHost.indexOf("]");
  const normalized = lowerHost.startsWith("[") && closingBracket > 0
    ? lowerHost.slice(1, closingBracket)
    : lowerHost.split(":")[0];
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export default async function LocalPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  if (!isLoopbackHost((await headers()).get("host"))) notFound();

  return (
    <InboxClient
      accountEmail="preview@example.invalid"
      accountName="Local preview"
      initialListing={localPreviewListing}
      localPreview
    />
  );
}
