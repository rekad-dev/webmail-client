import { getAuthSession, signIn } from "@/auth";
import { SignInView } from "@/components/sign-in/sign-in-view";
import { InboxClient } from "./inbox-client";

export default async function HomePage() {
  const session = await getAuthSession();
  const isSignedIn =
    session?.expires !== undefined && Date.parse(session.expires) > Date.now();

  async function signInWithStalwart() {
    "use server";
    await signIn("stalwart", { redirectTo: "/" });
  }

  return (
    isSignedIn ? (
      <InboxClient accountName={session?.user?.name} accountEmail={session?.user?.email} />
    ) : (
      <SignInView signInAction={signInWithStalwart} />
    )
  );
}
