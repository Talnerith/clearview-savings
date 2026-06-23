import Link from "next/link";

import { Brandmark } from "@/components/Brandmark";
import { LegalLinksNav } from "@/components/LegalLinksNav";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header scaled to match the patient chrome (M9 round 2): same
          width, same Brandmark size, so the whole product reads as one. */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-8 py-5 flex items-center justify-between gap-6">
          <Link href="/" aria-label="Clearview Savings home">
            <Brandmark size="lg" />
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            {user ? (
              <Link
                href="/caregiver"
                className="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white transition hover:bg-emerald-800 active:bg-emerald-900"
              >
                Caregiver dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="text-slate-700 hover:text-slate-900"
                >
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white transition hover:bg-emerald-800 active:bg-emerald-900"
                >
                  Create account
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <LegalLinksNav />
    </div>
  );
}
