import { getAuthSession, signIn } from "@/auth";
import Image from "next/image";
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
      <main className="sign-in-shell">
        <section className="status-card" aria-labelledby="page-title">
          <div className="sign-in-brand-row">
            <Image alt="" height={836} priority src="/logo.png" width={824} />
            <p className="sign-in-brand">rekad</p>
          </div>
          <h1 id="page-title">Sign in to rekad Mail</h1>
          <p>Use your rekad email account to continue.</p>
          <form action={signInWithStalwart}>
            <button className="sign-in-button" type="submit">
              Sign in with Stalwart
            </button>
          </form>
        </section>
      </main>
    )
  );
}
