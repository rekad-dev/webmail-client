import { getAuthSession, signIn } from "@/auth";
import { SignOutButton } from "./sign-out-button";

export default async function HomePage() {
  const session = await getAuthSession();
  const isSignedIn =
    session?.expires !== undefined && Date.parse(session.expires) > Date.now();

  async function signInWithStalwart() {
    "use server";
    await signIn("stalwart", { redirectTo: "/" });
  }

  return (
    <main className="shell">
      <section className="status-card" aria-labelledby="page-title">
        <p className="eyebrow">rekad Mail</p>
        <h1 id="page-title">
          {isSignedIn ? "You’re signed in" : "Sign in to rekad Mail"}
        </h1>
        <p>
          {isSignedIn
            ? "Your Stalwart session is active. Mailbox browsing is not available yet."
            : "Use your rekad email account to continue."}
        </p>
        {isSignedIn ? (
          <SignOutButton />
        ) : (
          <form action={signInWithStalwart}>
            <button className="sign-in-button" type="submit">
              Sign in with Stalwart
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
