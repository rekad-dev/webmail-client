import { redirect } from "next/navigation";
import { getAuthSession } from "@/auth";
import { getProfilePictureVersion } from "@/lib/profile/profile-picture-store.mts";
import { AccountRequestScope } from "@/components/mail/account-request-scope";
import { InboxClient } from "../inbox-client";

export default async function SettingsPage() {
  const session = await getAuthSession();
  if (!session?.expires || !(Date.parse(session.expires) > Date.now())) redirect("/");

  const accountName = session.user?.name?.trim() || session.user?.email?.trim() || "rekad account";
  let pictureVersion: number | null = null;
  let pictureAvailable = false;
  if (typeof session.user?.id === "string") {
    try {
      pictureVersion = await getProfilePictureVersion(session.user.id);
      pictureAvailable = true;
    } catch {
      // Other settings remain usable if the picture store is unavailable.
    }
  }

  return (
    <>
      {session.accountHandle ? <AccountRequestScope handle={session.accountHandle} /> : null}
      <InboxClient accountName={accountName} accountEmail={session.user?.email} profilePictureVersion={pictureVersion} profilePictureAvailable={pictureAvailable} initialSettings />
    </>
  );
}
