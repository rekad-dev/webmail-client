import { getAuthSession, signIn } from "@/auth";
import Image from "next/image";
import { InboxClient } from "./inbox-client";
import { MailIcon } from "./mail-icons";
import { isManagedBannerAdmin } from "@/lib/mail/managed-banner-store.mts";

export default async function HomePage() {
  const session = await getAuthSession();
  const isSignedIn =
    session?.expires !== undefined && Date.parse(session.expires) > Date.now();
  const canManageBanners = isSignedIn && typeof session?.user?.id === "string" &&
    isManagedBannerAdmin(session.user.id);

  async function signInWithStalwart() {
    "use server";
    await signIn("stalwart", { redirectTo: "/" });
  }

  return (
    isSignedIn ? (
      <InboxClient accountName={session?.user?.name} accountEmail={session?.user?.email} canManageBanners={canManageBanners} />
    ) : (
      <main className="sign-in-shell">
        <div className="sign-in-frame">
          <header className="sign-in-top-nav">
            <a className="mail-brand sign-in-brand-link" href="/" aria-label="rekad Mail home">
              <Image
                alt=""
                className="brand-image"
                height={836}
                priority
                src="/logo.png"
                width={824}
              />
              <span className="brand-wordmark">rekad</span>
              <span className="brand-name">Mail</span>
            </a>
            <span className="sign-in-top-badge">Stalwart JMAP</span>
          </header>

          <div className="sign-in-split">
            <section className="status-card sign-in-panel" aria-labelledby="page-title">
              <div className="sign-in-panel-header">
                <p className="eyebrow">Account access</p>
                <h1 id="page-title">Sign in to rekad Mail</h1>
                <p className="sign-in-lead">
                  Continue with your provisioned rekad account to read, search, and send mail through Stalwart.
                </p>
              </div>

              <form action={signInWithStalwart} className="sign-in-form">
                <button className="sign-in-button" type="submit">
                  <MailIcon name="mail" size={19} />
                  <span>Sign in with Stalwart</span>
                </button>
              </form>

              <dl className="sign-in-meta-list">
                <div>
                  <dt>Authentication</dt>
                  <dd>OAuth 2.0 Authorization Code with PKCE via Stalwart</dd>
                </div>
                <div>
                  <dt>Offline copies</dt>
                  <dd>
                    Saved a message on this browser?{" "}
                    <a href="/offline.html">Open offline copies</a>
                  </dd>
                </div>
              </dl>
            </section>

            <aside className="sign-in-showcase" aria-label="Workspace overview">
              <div className="sign-in-showcase-window" aria-hidden="true">
                <div className="sign-in-showcase-bar">
                  <span className="sign-in-showcase-dots">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="sign-in-showcase-pill">
                    <MailIcon name="inbox" size={14} />
                    <span>Inbox · JMAP</span>
                  </span>
                </div>
                <div className="sign-in-showcase-rows">
                  <div className="sign-in-showcase-row is-active">
                    <span className="sign-in-showcase-icon">
                      <MailIcon name="mail" size={18} />
                    </span>
                    <div className="sign-in-showcase-lines">
                      <strong>Threaded conversations &amp; search</strong>
                      <span>Search across all mailboxes or filter the active folder</span>
                    </div>
                  </div>
                  <div className="sign-in-showcase-row">
                    <span className="sign-in-showcase-icon is-lemon">
                      <MailIcon name="send" size={18} />
                    </span>
                    <div className="sign-in-showcase-lines">
                      <strong>Rich-text compose &amp; JMAP drafts</strong>
                      <span>Autosaved drafts, bounded attachments, and idempotent send</span>
                    </div>
                  </div>
                  <div className="sign-in-showcase-row">
                    <span className="sign-in-showcase-icon">
                      <MailIcon name="offline" size={18} />
                    </span>
                    <div className="sign-in-showcase-lines">
                      <strong>Isolated reading &amp; offline copies</strong>
                      <span>Sandboxed HTML messages and explicit on-device copies</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="sign-in-showcase-caption">
                <h2>Focused webmail for rekad</h2>
                <p>
                  Built for fast keyboard navigation, strict HTML email isolation, and direct JMAP synchronization without exposing tokens to the browser.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </main>
    )
  );
}
