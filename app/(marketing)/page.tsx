import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Clearview Savings",
  description:
    "A calm, familiar bank-style companion application for memory care.",
};

export default async function LandingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/caregiver");

  return (
    <div className="bg-slate-50">
      {/* Hero on the deep-emerald brand band — the same masthead identity
          the patient view carries (M9 round 2: one product, one look). */}
      <section className="bg-emerald-900">
        <div className="mx-auto max-w-3xl px-6 pt-16 pb-14 text-center">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white">
            A calm, familiar bank screen for someone who needs reassurance.
          </h1>
          <p className="mt-6 text-lg text-emerald-50 leading-relaxed">
            Clearview Savings is a memory-care companion application.
            Caregivers set up an account, schedule recurring deposits, and
            generate printable checks. The person they care for sees a steady,
            predictable bank-like view they can return to whenever they feel
            worried about money.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              href="/sign-up"
              className="rounded-full bg-white px-6 py-3 text-base font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-50 active:bg-emerald-100 active:scale-[0.98]"
            >
              Create an account
            </Link>
            <Link
              href="/sign-in"
              className="rounded-full border border-emerald-200 px-6 py-3 text-base font-medium text-white transition hover:bg-emerald-800 active:bg-emerald-950"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="text-2xl font-semibold text-slate-900">What this is</h2>
        <div className="mt-4 space-y-4 text-slate-700 leading-relaxed">
          <p>
            Many people living with Alzheimer&rsquo;s and other forms of
            dementia develop persistent anxiety about money &mdash; that funds
            are missing, that a pension hasn&rsquo;t arrived, that a bill is
            unpaid. The worry is real even when the underlying finances are
            fine.
          </p>
          <p>
            Clearview Savings is a simulated banking interface. It looks and
            feels like a normal bank screen, but it&rsquo;s controlled entirely
            by the caregiver behind the scenes. The deposits, the balances, the
            printed checks &mdash; all real-looking, none of it touching real
            money.
          </p>
          <p>
            This approach is called a <em>simulated environment</em> in
            dementia-care literature. It&rsquo;s the same idea behind the prop
            wallets, fake mail, and demo ATMs that memory-care facilities have
            used for decades.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-12 border-t border-slate-200">
        <h2 className="text-2xl font-semibold text-slate-900">How it works</h2>
        <ol className="mt-6 space-y-6 text-slate-700 leading-relaxed">
          <li className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-sm font-semibold text-white">
              1
            </span>
            <div>
              <h3 className="font-semibold text-slate-900">
                Caregiver creates an account
              </h3>
              <p className="mt-1">
                You sign up, confirm your email, and add the person you care
                for. Their view is private to you.
              </p>
            </div>
          </li>
          <li className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-sm font-semibold text-white">
              2
            </span>
            <div>
              <h3 className="font-semibold text-slate-900">
                Schedule deposits and generate checks
              </h3>
              <p className="mt-1">
                Set up recurring direct deposits (a pension, social security,
                whatever fits). Print real-looking checks for one-off amounts
                they can &ldquo;deposit&rdquo; using a single-use code.
              </p>
            </div>
          </li>
          <li className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-sm font-semibold text-white">
              3
            </span>
            <div>
              <h3 className="font-semibold text-slate-900">
                They see a calm bank screen
              </h3>
              <p className="mt-1">
                Your person opens a familiar-looking bank page, sees their
                balance, sees recent deposits, and can return to it as many
                times a day as they need to feel reassured.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-12 border-t border-slate-200">
        <h2 className="text-2xl font-semibold text-slate-900">
          Why families use it
        </h2>
        <div className="mt-4 space-y-4 text-slate-700 leading-relaxed">
          <p>
            Money anxiety is one of the most common, most painful, and most
            recurring sources of distress in mid-stage dementia. Repeating
            &ldquo;your pension is fine&rdquo; ten times a day stops working.
            Showing a calm screen the person can check themselves often does.
          </p>
          <p>
            Caregivers tell us the same thing: the goal isn&rsquo;t to deceive,
            it&rsquo;s to remove a recurring source of fear from a life
            that&rsquo;s already hard. The deception is the kindness.
          </p>
          <p>
            Clearview Savings doesn&rsquo;t connect to any real bank, never
            moves real money, and never asks for financial credentials. It is a
            companion application, not a financial service.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-12 border-t border-slate-200">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-6 text-slate-800">
          <h2 className="text-xl font-semibold text-slate-900">
            Ready to set it up for someone you care for?
          </h2>
          <p className="mt-2 text-slate-700">
            Free during beta. No credit card, no real banking integration.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/sign-up"
              className="rounded-md bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-800 active:bg-emerald-900"
            >
              Create an account
            </Link>
            <Link
              href="/about"
              className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-100 active:bg-slate-200"
            >
              Learn more
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
