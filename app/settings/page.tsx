import { redirect } from "next/navigation";
import { getAuthSession } from "@/auth";
import { getProfilePictureVersion } from "@/lib/profile/profile-picture-store.mts";
import { SettingsView } from "./settings-view";

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

  return <SettingsView accountName={accountName} pictureVersion={pictureVersion} pictureAvailable={pictureAvailable} />;
}
