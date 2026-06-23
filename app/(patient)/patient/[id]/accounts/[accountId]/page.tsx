import { and, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";

import { getPatientBrand, getPatientBrandById } from "@/lib/branding";
import { db } from "@/lib/db";
import {
  accounts,
  patients,
  transactions,
  type Transaction,
} from "@/lib/db/schema";
import { withRunningBalances } from "@/lib/running-balance";

import { InfoRail } from "../../InfoRail";
import {
  formatDateLong,
  formatMoney,
  readSettings,
} from "../../patient-format";
import { WelcomeFallback } from "../../WelcomeFallback";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; accountId: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const brand = await getPatientBrandById(id);
  // Account name isn't pulled here — that would double the DB load just for
  // the tab title. Brand alone reads as "real bank" enough.
  return { title: `${brand.name} — Account` };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TX_LIMIT = 50;

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string; accountId: string }>;
}) {
  const { id, accountId } = await params;

  if (!UUID_RE.test(id) || !UUID_RE.test(accountId)) {
    return <WelcomeFallback brandName={getPatientBrand().name} />;
  }

  let patientRows: (typeof patients.$inferSelect)[] = [];
  try {
    patientRows = await db
      .select()
      .from(patients)
      .where(eq(patients.id, id))
      .limit(1);
  } catch {
    return <WelcomeFallback brandName={getPatientBrand().name} />;
  }
  const patient = patientRows[0];
  if (!patient) {
    return <WelcomeFallback brandName={getPatientBrand().name} />;
  }

  const brand = getPatientBrand(patient);
  const settings = readSettings(patient.settings);

  // Account scoped to this patient — hand-crafted URLs that mix patient and
  // account from different owners fall through to the welcome panel.
  let accountRows: (typeof accounts.$inferSelect)[] = [];
  try {
    accountRows = await db
      .select()
      .from(accounts)
      .where(
        and(eq(accounts.id, accountId), eq(accounts.patientId, patient.id)),
      )
      .limit(1);
  } catch {
    return <WelcomeFallback brandName={brand.name} />;
  }
  const account = accountRows[0];
  if (!account) {
    return <WelcomeFallback brandName={brand.name} />;
  }

  let txs: Transaction[] = [];
  try {
    txs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, account.id))
      .orderBy(desc(transactions.postedAt))
      .limit(TX_LIMIT);
  } catch {
    txs = [];
  }

  const tableRows = withRunningBalances(txs, account.balanceCents);

  return (
    <div className="pb-12">
      {/* Hero balance band — account name and the balance large and white on
          the deep brand color, the real-bank account-view treatment.
          emerald-900 carries white text at WCAG AAA (≈10:1). Desktop layout
          (ADR 0005): account name at left, balance at right, like the
          reference banks' account-detail headers. */}
      <section className="border-t border-emerald-800 bg-emerald-900">
        <div className="mx-auto max-w-6xl px-8 py-10">
          <Link
            href={`/patient/${patient.id}`}
            className="inline-block text-lg text-emerald-100 underline-offset-4 hover:underline"
          >
            ← Back to your accounts
          </Link>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
            <h1 className="text-4xl font-semibold text-white">
              {account.name}
            </h1>
            <div className="text-right">
              <div className="text-base uppercase tracking-wide text-emerald-100">
                Available Balance
              </div>
              <div className="mt-1 text-6xl font-semibold tabular-nums text-white">
                {formatMoney(account.balanceCents, settings)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Two columns, unconditionally (ADR 0005): transactions at left,
          decorative info rail at right (ADR 0006). */}
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_21rem] items-start gap-10 px-8 pt-10">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h2 className="px-6 pt-6 text-2xl font-semibold">
            Recent Transactions
          </h2>
          {/* Desktop-dedicated table (ADR 0005): the Date column is always
              visible — no small-screen collapse. */}
          {tableRows.length === 0 ? (
            <p className="px-6 py-6 text-slate-700">No transactions yet.</p>
          ) : (
            <table className="mt-4 w-full">
              <thead>
                <tr className="border-b border-slate-200 text-left text-base uppercase tracking-wide text-slate-700">
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Description</th>
                  <th className="px-6 py-3 text-right font-medium">Amount</th>
                  <th className="px-6 py-3 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {tableRows.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-6 py-4 align-top text-lg text-slate-700 whitespace-nowrap">
                      {formatDateLong(tx.postedAt, settings)}
                    </td>
                    <td className="w-full px-6 py-4 align-top">
                      <div className="text-xl">{tx.label}</div>
                    </td>
                    <td
                      className={`px-6 py-4 text-right align-top text-xl tabular-nums whitespace-nowrap ${
                        tx.amountCents < 0
                          ? "text-slate-900"
                          : "text-emerald-800"
                      }`}
                    >
                      {formatMoney(tx.amountCents, settings)}
                    </td>
                    <td className="px-6 py-4 text-right align-top text-xl tabular-nums whitespace-nowrap text-slate-900">
                      {formatMoney(tx.runningBalanceCents, settings)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <InfoRail variant="account" />
      </div>
    </div>
  );
}
