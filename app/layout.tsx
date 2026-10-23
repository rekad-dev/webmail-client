import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
