import Link from "next/link";

import { Brandmark } from "@/components/Brandmark";
import { LegalLinksNav } from "@/components/LegalLinksNav";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header scaled to match the patient chrome (M9 round 2). */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-8 py-5">
          <Link href="/" aria-label="Clearview Savings home">
            <Brandmark size="lg" />
          </Link>
        </div>
      </header>
      <main className="flex-1 grid place-items-center px-6 py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <LegalLinksNav />
    </div>
  );
}
