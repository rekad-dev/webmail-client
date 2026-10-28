import { getAuthSession, signIn } from "@/auth";
import { getProfilePictureVersion } from "@/lib/profile/profile-picture-store.mts";
import { AccountRequestScope } from "@/components/mail/account-request-scope";
import { SignInView } from "@/components/sign-in/sign-in-view";
import { InboxClient } from "./inbox-client";

export default async function HomePage() {
  const session = await getAuthSession();
  const isSignedIn =
    session?.expires !== undefined && Date.parse(session.expires) > Date.now();

  // A missing table or a database error must not stop the inbox from loading.
  let profilePictureVersion: number | null = null;
  if (isSignedIn && typeof session?.user?.id === "string") {
    try {
      profilePictureVersion = await getProfilePictureVersion(session.user.id);
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
        />
      </>
    ) : (
      <SignInView signInAction={signInWithStalwart} />
    )
  );
}
