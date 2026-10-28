import Image from "next/image";
import { Button } from "@/components/ui/button";

const SAFETY_TIPS = [
  "Don't reply to emails that ask for your password, including ones that claim to come from an administrator or threaten to block your account.",
  "Make sure you open webmail at https://webmail.rekad.id/.",
  "Be careful with links in emails. Before you enter your username and password, check the address bar and confirm the domain is rekad.id or ends in .rekad.id.",
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

function ShieldLock() {
  return (
    <svg aria-hidden="true" className="signin-shield" focusable="false" viewBox="0 0 48 56">
      <path
        d="M24 2 3 9v18c0 13 9 22 21 27 12-5 21-14 21-27V9L24 2Z"
        fill="#f6c93f"
      />
      <rect fill="#14204f" height="15" rx="2.5" width="18" x="15" y="26" />
      <path
        d="M19 26v-4a5 5 0 0 1 10 0v4"
        fill="none"
        stroke="#14204f"
        strokeLinecap="round"
        strokeWidth="3.4"
      />
    </svg>
  );
}

export function SignInView({ signInAction }: { signInAction: () => Promise<void> }) {
  return (
    <main className="signin-page">
      <script
        dangerouslySetInnerHTML={{ __html: STRUCTURED_DATA }}
        type="application/ld+json"
      />
      <div className="signin-column">
        <section className="signin-card" aria-labelledby="page-title">
          <h1 className="signin-brand" id="page-title">
            <Image
              alt=""
              className="signin-logo"
              height={836}
              priority
              src="/logo.png"
              width={824}
            />
            <span className="signin-wordmark">rekad</span>
            <span className="signin-product">Mail</span>
          </h1>
          <p className="signin-lead">Sign in with your rekad.id account.</p>
          <form action={signInAction}>
            <Button
              className="w-full border border-[#e0b53a] bg-linear-to-b from-[#fadb62] to-[#f0c63f] font-extrabold tracking-wider text-[#14204f] uppercase hover:from-[#fbe27e] hover:to-[#f3cd4d]"
              size="lg"
              type="submit"
            >
              Sign in
            </Button>
          </form>
          <p className="signin-note">You enter your username and password on mail.rekad.id.</p>
        </section>

        <hr className="signin-rule" />

        <section className="signin-safety" aria-labelledby="safety-title">
          <ShieldLock />
          <h2 id="safety-title">rekad administrators will never ask for your password</h2>
          <p>To keep your account safe:</p>
          <ul>
            {SAFETY_TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
