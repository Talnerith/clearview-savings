import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";

import { getPatientBrand, getPatientBrandById } from "@/lib/branding";
import { db } from "@/lib/db";
import { accounts, patients } from "@/lib/db/schema";
import { materializeScheduledDeposits } from "@/lib/scheduled-deposits/materialize";
import {
  getPendingDeposits,
  type PendingDepositItem,
} from "@/lib/scheduled-deposits/pending";

import { InfoRail } from "./InfoRail";
import { formatMoney, readSettings } from "./patient-format";
import { PendingBanner } from "./PendingBanner";
import { WelcomeFallback } from "./WelcomeFallback";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const brand = await getPatientBrandById(id);
  return { title: `${brand.name} — Your Accounts` };
}

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  let patientRows: (typeof patients.$inferSelect)[] = [];
  if (isUuid) {
    try {
      patientRows = await db
        .select()
        .from(patients)
        .where(eq(patients.id, id))
        .limit(1);
    } catch {
      return <WelcomeFallback brandName={getPatientBrand().name} />;
    }
  }
  const patient = patientRows[0];

  if (!patient) {
    return <WelcomeFallback brandName={getPatientBrand().name} />;
  }

  // Best-effort. If the DB hiccups during materialization the patient still
  // sees whatever was already committed; the next page load will catch up.
  try {
    await materializeScheduledDeposits(db, patient.id);
  } catch {
    // intentionally swallowed — degrade rather than blank the page
  }

  const settings = readSettings(patient.settings);
  const brand = getPatientBrand(patient);

  let patientAccounts: (typeof accounts.$inferSelect)[];
  try {
    patientAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.patientId, patient.id))
      .orderBy(asc(accounts.createdAt));
  } catch {
    // Accounts are the page's primary content. Without them the screen is
    // meaningless — fall back to the neutral welcome panel.
    return <WelcomeFallback brandName={brand.name} />;
  }

  const accountIds = patientAccounts.map((a) => a.id);

  const now = new Date();

  let pendingItems: PendingDepositItem[] = [];
  if (accountIds.length > 0) {
    try {
      pendingItems = await getPendingDeposits(db, patient.id, now);
    } catch {
      pendingItems = [];
    }
  }

  return (
    <div className="pb-12">
      {/* Greeting band — the real-bank treatment: white on the deep brand
          color, full bleed, with the page's one primary action as a pill.
          emerald-900 carries white text at WCAG AAA (≈10:1). Desktop layout
          (ADR 0005): greeting at left, action pill at right, like the
          reference banks' account-overview headers. Full display name, not
          first name — the patient's own full name on screen is a stronger
          "this is my bank" cue (user request, M9 visual review). */}
      <section className="border-t border-emerald-800 bg-emerald-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-10 gap-y-7 px-8 py-10">
          <h1 className="text-4xl font-semibold text-white">
            {greeting(now)}, {patient.displayName.trim()}.
          </h1>
          {/* One deposit action for everything the patient receives — plain
              checks and finished-work rewards alike (ADR 0004). */}
          <Link
            href={`/patient/${patient.id}/deposit`}
            className="inline-block rounded-full bg-white px-8 py-4 text-2xl font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-50 active:scale-[0.98] active:bg-emerald-100"
          >
            Deposit a Check
          </Link>
        </div>
      </section>

      {/* Two columns, unconditionally (ADR 0005 — no responsive collapse):
          accounts at left, decorative info rail at right (ADR 0006). */}
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_21rem] items-start gap-10 px-8 pt-10">
        <div className="space-y-10">
          <PendingBanner
            items={pendingItems}
            settings={settings}
            now={now}
            showAccountSuffix={patientAccounts.length >= 2}
          />

          <section className="space-y-5">
            <h2 className="text-3xl font-semibold">Your Accounts</h2>
          {/* Bank-style account rows: name left, balance right. The recent
              transactions preview moved to the account page, which owns the
              full table (M9 Step 5) — one fact per row, fewer competing
              elements on the home screen. */}
            <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {patientAccounts.map((acct) => (
                <Link
                  key={acct.id}
                  href={`/patient/${patient.id}/accounts/${acct.id}`}
                  aria-label={`Open ${acct.name}`}
                  className="flex items-center justify-between gap-6 px-8 py-6 transition hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700"
                >
                  <div>
                    <div className="text-2xl font-medium text-emerald-800">
                      {acct.name}
                    </div>
                    <div className="mt-1 text-base uppercase tracking-wide text-slate-700">
                      Available Balance
                    </div>
                  </div>
                  <div className="text-3xl font-semibold tabular-nums whitespace-nowrap">
                    {formatMoney(acct.balanceCents, settings)}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <InfoRail variant="home" />
      </div>
    </div>
  );
}
