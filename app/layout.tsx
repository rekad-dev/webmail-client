import type { Metadata } from "next";
import { Inter_Tight, Nunito } from "next/font/google";
import "./styles.css";
import { Toaster } from "@/components/ui/sonner";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "700", "800"],
  display: "swap",
});

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = "https://webmail.rekad.id";
const title = "rekad Mail, webmail for rekad.id";
const description = "Sign in to read and send email with your rekad.id account.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title, template: "%s | rekad Mail" },
  description,
  applicationName: "rekad Mail",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "rekad Mail",
    url: siteUrl,
    title,
    description,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title, description },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${nunito.variable} ${interTight.variable}`}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
