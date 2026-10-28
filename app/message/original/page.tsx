import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/auth";
import { OriginalMessage } from "./original-message";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Original message · rekad Mail",
  robots: { index: false, follow: false },
};

export default async function OriginalMessagePage({
  searchParams,
}: {
  searchParams: Promise<{ emailId?: string | string[] }>;
}) {
  const session = await getAuthSession();
  if (!session?.expires || Date.parse(session.expires) <= Date.now()) redirect("/");

  const { emailId } = await searchParams;
  return <OriginalMessage emailId={typeof emailId === "string" ? emailId : null} />;
}
