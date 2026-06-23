import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";

import { FooterDisclosure } from "@/components/FooterDisclosure";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Clearview Savings",
    template: "%s — Clearview Savings",
  },
  description:
    "A calm, familiar bank-style companion application for memory care.",
  // Favicon comes from app/icon.svg (Next.js file convention). It uses the
  // same cropped sun+wave artwork as public/branding/clearview-savings-icon.svg
  // (the asset referenced in headers, emails, etc.). Next.js auto-hashes the
  // app/icon.svg URL so browsers refetch on each deploy.
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <FooterDisclosure />
        <Analytics />
      </body>
    </html>
  );
}
