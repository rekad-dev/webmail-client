import Image from "next/image";
import { MailIcon, type MailIconName } from "@/app/mail-icons";
import { Button } from "@/components/ui/button";

const FEATURES: Array<{ icon: MailIconName; title: string; text: string }> = [
  {
    icon: "search",
    title: "Search",
    text: "Look through every mailbox, or only the one you have open.",
  },
  {
    icon: "send",
    title: "Write",
    text: "Format your message, attach files up to 4 MiB each, and finish unsent drafts later.",
  },
  {
    icon: "mail",
    title: "Read",
    text: "Messages open without remote images or scripts, and links ask before they open.",
  },
  {
    icon: "offline",
    title: "Keep copies",
    text: "Save a message on this device to read it without a connection.",
  },
];

const STRUCTURED_DATA = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.rekad.id/#organization",
      name: "rekad",
      url: "https://www.rekad.id",
      logo: "https://webmail.rekad.id/logo.png",
    },
    {
      "@type": "WebSite",
      "@id": "https://webmail.rekad.id/#website",
      name: "rekad Mail",
      url: "https://webmail.rekad.id/",
      publisher: { "@id": "https://www.rekad.id/#organization" },
    },
  ],
});

export function SignInView({ signInAction }: { signInAction: () => Promise<void> }) {
  return (
    <main className="sign-in-shell">
      <script
        dangerouslySetInnerHTML={{ __html: STRUCTURED_DATA }}
        type="application/ld+json"
      />
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
          <a className="sign-in-top-badge" href="https://www.rekad.id">www.rekad.id</a>
        </header>

        <div className="sign-in-split">
          <section className="status-card sign-in-panel" aria-labelledby="page-title">
            <div className="sign-in-panel-header">
              <h1 id="page-title">Sign in to rekad Mail</h1>
              <p className="sign-in-lead">Read and send email with your rekad.id account.</p>
            </div>

            <form action={signInAction} className="sign-in-form">
              <Button className="sign-in-button" size="lg" type="submit">
                <MailIcon name="mail" size={19} />
                <span>Continue to sign in</span>
              </Button>
              <p className="sign-in-note">You enter your password on mail.rekad.id, not on this page.</p>
            </form>

            <p className="sign-in-offline">
              Saved a message for offline reading on this browser?{" "}
              <a href="/offline.html">Open offline copies</a>
            </p>
          </section>

          <aside className="sign-in-showcase" aria-labelledby="features-title">
            <h2 className="sign-in-features-title" id="features-title">What you can do here</h2>
            <ul className="sign-in-showcase-rows">
              {FEATURES.map((feature) => (
                <li className="sign-in-showcase-row" key={feature.title}>
                  <span className="sign-in-showcase-icon">
                    <MailIcon name={feature.icon} size={18} />
                  </span>
                  <div className="sign-in-showcase-lines">
                    <strong>{feature.title}</strong>
                    <span>{feature.text}</span>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </main>
  );
}
