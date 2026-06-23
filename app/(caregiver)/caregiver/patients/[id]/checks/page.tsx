import { and, asc, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPatientForCaregiver } from "@/lib/auth/require-patient";
import { db } from "@/lib/db";
import { accounts, depositCodes } from "@/lib/db/schema";

import { createCheckAction } from "./actions";

export const metadata = {
  title: "Checks — Caregiver — Clearview Savings",
};

type PatientSettings = {
  font_size: string;
  locale: string;
  currency: string;
};

function readSettings(raw: unknown): PatientSettings {
  if (raw && typeof raw === "object") {
    const r = raw as Partial<PatientSettings>;
    return {
      font_size: typeof r.font_size === "string" ? r.font_size : "lg",
      locale: typeof r.locale === "string" ? r.locale : "en-US",
      currency: typeof r.currency === "string" ? r.currency : "USD",
    };
  }
  return { font_size: "lg", locale: "en-US", currency: "USD" };
}

function formatMoney(cents: number, s: PatientSettings): string {
  return new Intl.NumberFormat(s.locale, {
    style: "currency",
    currency: s.currency,
    currencyDisplay: "narrowSymbol",
  }).format(cents / 100);
}

function formatDateTime(date: Date, s: PatientSettings): string {
  return new Intl.DateTimeFormat(s.locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function CaregiverChecksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; status?: string; codeId?: string }>;
}) {
  const { id } = await params;
  const { error, status, codeId } = await searchParams;

  const { patient } = await getPatientForCaregiver(id);
  const settings = readSettings(patient.settings);

  const patientAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.patientId, patient.id))
    .orderBy(asc(accounts.createdAt));
  const accountById = new Map(patientAccounts.map((a) => [a.id, a]));
  const defaultAccountId = patientAccounts[0]?.id ?? "";
  const showAccountPicker = patientAccounts.length >= 2;

  const checks = await db
    .select()
    .from(depositCodes)
    .where(
      and(
        eq(depositCodes.patientId, patient.id),
        eq(depositCodes.kind, "check"),
        // Exclude workbook rewards: since M8 (ADR 0004) they are also
        // kind = "check", distinguished only by carrying workbook content.
        // They belong on the Workbooks surface, not here.
        isNull(depositCodes.workbookKind),
      ),
    )
    .orderBy(desc(depositCodes.createdAt));

  // Only treat the status banner as live if the codeId actually maps to one
  // of this patient's checks. Guards against stale or hand-crafted URLs and
  // avoids rendering a "Just generated" banner whose Open button would 404.
  const justGenerated =
    status === "just-generated" && codeId
      ? checks.find((c) => c.id === codeId)
      : undefined;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/caregiver/patients/${patient.id}`}
          className="text-sm text-slate-600 hover:underline"
        >
          ← {patient.displayName}
        </Link>
        <h1 className="text-2xl font-semibold mt-1">Checks</h1>
        <p className="text-sm text-slate-600 mt-1">
          Generate a printable check that {patient.displayName} can deposit
          using the code on the bottom of the page.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      )}

      {justGenerated && (
        <div className="flex flex-col gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-emerald-900">Check generated</p>
            <p className="text-sm text-emerald-900/80">
              Open the printable check, print it, then hand it to{" "}
              {patient.displayName}. They&apos;ll type the code{" "}
              <span className="font-mono">{justGenerated.code}</span> on their
              deposit screen.
            </p>
          </div>
          <a
            href={`/caregiver/patients/${patient.id}/checks/${justGenerated.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Open the printable check ↗
          </a>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>New check</CardTitle>
          <CardDescription>
            One check, one deposit code. Print the PDF, hand it over, then{" "}
            {patient.displayName} types the code on their deposit screen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={createCheckAction}
            className="grid md:grid-cols-2 gap-4 max-w-2xl"
          >
            <input type="hidden" name="patientId" value={patient.id} />
            {showAccountPicker ? (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="check-account">Deposit into</Label>
                <select
                  id="check-account"
                  name="accountId"
                  required
                  defaultValue={defaultAccountId}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                >
                  {patientAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <input type="hidden" name="accountId" value={defaultAccountId} />
            )}
            <div className="space-y-2">
              <Label htmlFor="check-amount">Amount</Label>
              <Input
                id="check-amount"
                name="amount"
                inputMode="decimal"
                placeholder="50.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="check-label">Description</Label>
              <Input
                id="check-label"
                name="label"
                placeholder="Birthday from Aunt Susan"
                required
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="check-memo">Memo (optional, prints on the check)</Label>
              <Input
                id="check-memo"
                name="memo"
                placeholder="Happy birthday!"
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={patientAccounts.length === 0}>
                Generate check
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Previously generated</CardTitle>
          <CardDescription>
            {checks.length === 0
              ? "No checks generated yet."
              : "Reprint or check whether a code has been used."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {checks.length === 0 ? (
            <p className="text-sm text-slate-600">
              Use the form above to create the first one.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 font-medium">Created</th>
                  <th className="py-2 font-medium">Description</th>
                  {showAccountPicker && (
                    <th className="py-2 font-medium">Account</th>
                  )}
                  <th className="py-2 font-medium">Code</th>
                  <th className="py-2 font-medium text-right">Amount</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {checks.map((c) => {
                  const isJustGenerated = justGenerated?.id === c.id;
                  return (
                    <tr
                      key={c.id}
                      className={isJustGenerated ? "bg-emerald-50" : ""}
                    >
                      <td className="py-2">
                        {formatDateTime(c.createdAt, settings)}
                      </td>
                      <td className="py-2">{c.label}</td>
                      {showAccountPicker && (
                        <td className="py-2 text-slate-600">
                          {c.targetAccountId
                            ? accountById.get(c.targetAccountId)?.name ?? "—"
                            : "—"}
                        </td>
                      )}
                      <td className="py-2 font-mono text-xs">{c.code}</td>
                      <td className="py-2 text-right tabular-nums">
                        {formatMoney(c.amountCents, settings)}
                      </td>
                      <td className="py-2">
                        {c.status === "used" ? (
                          <span className="text-slate-500">
                            Used
                            {c.usedAt
                              ? ` · ${formatDateTime(c.usedAt, settings)}`
                              : ""}
                          </span>
                        ) : isJustGenerated ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                            Just generated
                          </span>
                        ) : (
                          <span className="text-emerald-700">Unused</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <a
                          href={`/caregiver/patients/${patient.id}/checks/${c.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-slate-700 hover:underline"
                        >
                          Print ↗
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
