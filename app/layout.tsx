import type { Metadata } from "next";
import { Inter_Tight, Nunito } from "next/font/google";
import "./globals.css";
import "./reference-ui.css";

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

export const metadata: Metadata = {
  title: "rekad Mail",
  description: "A lightweight webmail client for rekad.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${nunito.variable} ${interTight.variable}`}>
      <body>{children}</body>
    </html>
  );
}
