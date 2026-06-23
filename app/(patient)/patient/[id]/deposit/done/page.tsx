import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";

import { getPatientBrand, getPatientBrandById } from "@/lib/branding";
import { db } from "@/lib/db";
import { accounts, patients, transactions } from "@/lib/db/schema";

import { formatMoney, readSettings } from "../../patient-format";
import { WelcomeFallback } from "../../WelcomeFallback";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const brand = await getPatientBrandById(id);
  return { title: `${brand.name} — Deposit Confirmed` };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DepositDonePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ txId?: string }>;
}) {
  const { id } = await params;
  const { txId } = await searchParams;

  const isPatientUuid = UUID_RE.test(id);
  let patientRows: (typeof patients.$inferSelect)[] = [];
  if (isPatientUuid) {
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

  const settings = readSettings(patient.settings);

  const isTxUuid = !!txId && UUID_RE.test(txId);
  let txRows: { tx: typeof transactions.$inferSelect; account: typeof accounts.$inferSelect }[] = [];
  if (isTxUuid) {
    try {
      txRows = await db
        .select({
          tx: transactions,
          account: accounts,
        })
        .from(transactions)
        .innerJoin(accounts, eq(accounts.id, transactions.accountId))
        .where(
          and(
            eq(transactions.id, txId!),
            eq(accounts.patientId, patient.id),
          ),
        )
        .limit(1);
    } catch {
      txRows = [];
    }
  }
  const found = txRows[0];

  // Defensive: if the tx isn't found or doesn't belong to this patient, fall
  // back to the home screen rather than render a 404 (CLAUDE.md patient UX).
  if (!found) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-12 space-y-10">
        <section className="space-y-6 text-center">
          <h1 className="text-3xl font-semibold">All set</h1>
          <p className="text-xl text-slate-700">
            Your deposit is being processed.
          </p>
          <Link
            href={`/patient/${patient.id}`}
            className="inline-block rounded-xl bg-emerald-700 px-8 py-5 text-2xl font-semibold text-white shadow-sm transition hover:bg-emerald-800 active:scale-[0.98] active:bg-emerald-900"
          >
            Done
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-12 space-y-10">
      <section className="space-y-8">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 space-y-6 shadow-sm">
          <h1 className="text-3xl font-semibold text-emerald-900">
            Deposit complete
          </h1>
          <div>
            <div className="text-base uppercase tracking-wide text-emerald-900">
              Deposited
            </div>
            <div className="mt-1 text-2xl text-emerald-900">
              {found.tx.label}
            </div>
            <div className="mt-2 text-4xl font-semibold tabular-nums text-emerald-900">
              {formatMoney(found.tx.amountCents, settings)}
            </div>
          </div>
          <div>
            <div className="text-base uppercase tracking-wide text-emerald-900">
              Available Balance
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-emerald-900">
              {formatMoney(found.account.balanceCents, settings)}
            </div>
            <div className="text-lg text-emerald-900 mt-1">
              {found.account.name}
            </div>
          </div>
        </div>

        <Link
          href={`/patient/${patient.id}`}
          className="block w-full rounded-xl bg-emerald-700 px-6 py-5 text-center text-2xl font-semibold text-white shadow-sm transition hover:bg-emerald-800 active:scale-[0.98] active:bg-emerald-900"
        >
          Done
        </Link>
      </section>
    </div>
  );
}
