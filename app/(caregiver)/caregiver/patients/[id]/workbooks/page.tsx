import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
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
import { gradeLabel, type WorkbookGrade } from "@/lib/workbook-content";

import { createWorkbookAction } from "./actions";

export const metadata = {
  title: "Workbooks — Caregiver — Clearview Savings",
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

function workbookKindLabel(kind: string | null): string {
  switch (kind) {
    case "math":
      return "Math";
    case "reading":
      return "Reading";
    case "mixed":
      return "Mixed";
    default:
      return "—";
  }
}

export default async function CaregiverWorkbooksPage({
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

  const workbooks = await db
    .select()
    .from(depositCodes)
    .where(
      and(
        eq(depositCodes.patientId, patient.id),
        // Workbook rows are marked by workbook content, not code kind — since
        // M8 (ADR 0004) the reward itself is minted as kind = "check".
        isNotNull(depositCodes.workbookKind),
      ),
    )
    .orderBy(desc(depositCodes.createdAt));

  const justGenerated =
    status === "just-generated" && codeId
      ? workbooks.find((w) => w.id === codeId)
      : undefined;

  const nextAutoTitle = `Activity Set #${workbooks.length + 1}`;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/caregiver/patients/${patient.id}`}
          className="text-sm text-slate-600 hover:underline"
        >
          ← {patient.displayName}
        </Link>
        <h1 className="text-2xl font-semibold mt-1">Workbooks</h1>
        <p className="text-sm text-slate-600 mt-1">
          Generate a printable activity set with a reward check on the last
          page. When {patient.displayName} completes the work, they deposit
          that check through &ldquo;Deposit a Check&rdquo; and the reward
          amount is added to their account.
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
            <p className="font-semibold text-emerald-900">Workbook generated</p>
            <p className="text-sm text-emerald-900/80">
              Print the workbook, then hand it to {patient.displayName}. The
              last page is a reward check (code{" "}
              <span className="font-mono">{justGenerated.code}</span>) they
              deposit through &ldquo;Deposit a Check.&rdquo;
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <a
              href={`/caregiver/patients/${patient.id}/workbooks/${justGenerated.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Open workbook ↗
            </a>
            <a
              href={`/caregiver/patients/${patient.id}/workbooks/${justGenerated.id}/answers`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-md border border-emerald-700 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
            >
              Answer key ↗
            </a>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>New workbook</CardTitle>
          <CardDescription>
            Five pages of activities + a final page with the deposit code.
            Default title is {nextAutoTitle}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={createWorkbookAction}
            className="grid md:grid-cols-2 gap-4 max-w-2xl"
          >
            <input type="hidden" name="patientId" value={patient.id} />
            {showAccountPicker ? (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="wb-account">Reward into</Label>
                <select
                  id="wb-account"
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
              <Label htmlFor="wb-grade">Difficulty</Label>
              <select
                id="wb-grade"
                name="grade"
                defaultValue="1"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                <option value="0">Kindergarten (gentlest)</option>
                <option value="1">Grade 1</option>
                <option value="2">Grade 2</option>
                <option value="3">Grade 3 (hardest)</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wb-kind">Content</Label>
              <select
                id="wb-kind"
                name="kind"
                defaultValue="mixed"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                <option value="mixed">Mixed</option>
                <option value="math">Math only</option>
                <option value="reading">Reading &amp; logic only</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wb-amount">Reward amount</Label>
              <Input
                id="wb-amount"
                name="amount"
                inputMode="decimal"
                placeholder="5.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wb-title">Title (optional)</Label>
              <Input
                id="wb-title"
                name="title"
                placeholder={nextAutoTitle}
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={patientAccounts.length === 0}>
                Generate workbook
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Previously generated</CardTitle>
          <CardDescription>
            {workbooks.length === 0
              ? "No workbooks generated yet."
              : "Reprint a copy, open the answer key, or check whether the code has been used."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workbooks.length === 0 ? (
            <p className="text-sm text-slate-600">
              Use the form above to create the first one.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 font-medium">Created</th>
                  <th className="py-2 font-medium">Title</th>
                  <th className="py-2 font-medium">Content</th>
                  <th className="py-2 font-medium">Grade</th>
                  {showAccountPicker && (
                    <th className="py-2 font-medium">Account</th>
                  )}
                  <th className="py-2 font-medium">Code</th>
                  <th className="py-2 font-medium text-right">Reward</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {workbooks.map((w) => {
                  const isJustGenerated = justGenerated?.id === w.id;
                  return (
                    <tr
                      key={w.id}
                      className={isJustGenerated ? "bg-emerald-50" : ""}
                    >
                      <td className="py-2">
                        {formatDateTime(w.createdAt, settings)}
                      </td>
                      <td className="py-2">{w.label}</td>
                      <td className="py-2">
                        {workbookKindLabel(w.workbookKind)}
                      </td>
                      <td className="py-2">
                        {w.workbookGrade != null
                          ? gradeLabel(w.workbookGrade as WorkbookGrade)
                          : "—"}
                      </td>
                      {showAccountPicker && (
                        <td className="py-2 text-slate-600">
                          {w.targetAccountId
                            ? accountById.get(w.targetAccountId)?.name ?? "—"
                            : "—"}
                        </td>
                      )}
                      <td className="py-2 font-mono text-xs">{w.code}</td>
                      <td className="py-2 text-right tabular-nums">
                        {formatMoney(w.amountCents, settings)}
                      </td>
                      <td className="py-2">
                        {w.status === "used" ? (
                          <span className="text-slate-500">
                            Used
                            {w.usedAt
                              ? ` · ${formatDateTime(w.usedAt, settings)}`
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
                        <div className="inline-flex gap-3">
                          <a
                            href={`/caregiver/patients/${patient.id}/workbooks/${w.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-slate-700 hover:underline"
                          >
                            Print ↗
                          </a>
                          <a
                            href={`/caregiver/patients/${patient.id}/workbooks/${w.id}/answers`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-slate-700 hover:underline"
                          >
                            Answers ↗
                          </a>
                        </div>
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
