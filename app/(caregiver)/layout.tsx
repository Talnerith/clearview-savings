import Link from "next/link";

import { Brandmark } from "@/components/Brandmark";
import { LegalLinksNav } from "@/components/LegalLinksNav";
import { Button } from "@/components/ui/button";

export default function CaregiverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <div className="bg-amber-100 border-b border-amber-300 text-amber-900 text-sm py-2 px-6 text-center">
        You are in caregiver mode.
      </div>
      {/* Header scaled to match the patient chrome (M9 round 2). */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-8 py-5 flex items-center justify-between">
          <Link href="/caregiver" aria-label="Caregiver dashboard">
            <Brandmark size="lg" />
          </Link>
          <nav className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/caregiver/settings">Settings</Link>
            </Button>
            <form action="/sign-out" method="post">
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
      <LegalLinksNav support />
    </div>
  );
}
