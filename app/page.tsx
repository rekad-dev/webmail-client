import { getAuthSession, signIn } from "@/auth";
import { getProfilePictureEntry, syncProfilePictureEmail } from "@/lib/profile/profile-picture-store.mts";
import { normalizePictureAddress } from "@/lib/profile/profile-picture-route.mts";
import { AccountRequestScope } from "@/components/mail/account-request-scope";
import { SignInView } from "@/components/sign-in/sign-in-view";
import { InboxClient } from "./inbox-client";

export default async function HomePage() {
  const session = await getAuthSession();
  const isSignedIn =
    session?.expires !== undefined && Date.parse(session.expires) > Date.now();

  // A missing table or a database error must not stop the inbox from loading.
  let profilePictureVersion: number | null = null;
  let profilePictureAvailable = false;
  if (isSignedIn && typeof session?.user?.id === "string") {
    try {
      const entry = await getProfilePictureEntry(session.user.id);
      profilePictureVersion = entry?.version ?? null;
      profilePictureAvailable = true;
      // Pictures saved before addresses were recorded become visible to colleagues once their owner opens the app.
      const address = normalizePictureAddress(session.user.email);
      if (entry && address && entry.email !== address) {
        await syncProfilePictureEmail(session.user.id, address).catch(() => undefined);
      }
    } catch {
      profilePictureVersion = null;
    }
  }

  async function signInWithStalwart() {
    "use server";
    await signIn("stalwart", { redirectTo: "/" });
  }

  return (
    isSignedIn ? (
      <>
        {session?.accountHandle ? <AccountRequestScope handle={session.accountHandle} /> : null}
        <InboxClient
          accountName={session?.user?.name}
          accountEmail={session?.user?.email}
          profilePictureVersion={profilePictureVersion}
          profilePictureAvailable={profilePictureAvailable}
        />
      </>
    ) : (
      <SignInView signInAction={signInWithStalwart} />
    )
  );
}
