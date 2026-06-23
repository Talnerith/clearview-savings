import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { getPatientForCaregiver } from "@/lib/auth/require-patient";
import { db } from "@/lib/db";
import {
  auditActionKindEnum,
  auditLog,
  type AuditLogEntry,
} from "@/lib/db/schema";

export const metadata = {
  title: "Audit log — Clearview Savings",
};

const ROWS_PER_PAGE = 50;

const ACTION_KIND_LABELS: Record<string, string> = {
  patient_created: "Patient created",
  patient_settings_updated: "Patient settings updated",
  account_created: "Account created",
  account_renamed: "Account renamed",
  transaction_created: "Manual transaction",
  scheduled_deposit_created: "Scheduled deposit created",
  scheduled_deposit_updated: "Scheduled deposit updated / resumed",
  scheduled_deposit_paused: "Scheduled deposit paused",
  scheduled_deposit_deleted: "Scheduled deposit deleted",
  check_code_generated: "Check code generated",
  workbook_code_generated: "Workbook code generated",
  transfer_made: "Transfer between accounts",
  code_voided: "Code voided",
};

function formatTimestamp(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function prettyJson(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return JSON.stringify(value, null, 2);
}

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { id } = await params;
  const { kind } = await searchParams;

  const { patient, caregiver } = await getPatientForCaregiver(id);

  // Filter validation: ignore unknown kinds rather than throw.
  const validKind =
    kind && (auditActionKindEnum.enumValues as readonly string[]).includes(kind)
      ? (kind as (typeof auditActionKindEnum.enumValues)[number])
      : null;

  const where = validKind
    ? and(
        eq(auditLog.caregiverId, caregiver.id),
        eq(auditLog.patientId, patient.id),
        eq(auditLog.actionKind, validKind),
      )
    : and(
        eq(auditLog.caregiverId, caregiver.id),
        eq(auditLog.patientId, patient.id),
      );

  const entries: AuditLogEntry[] = await db
    .select()
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(ROWS_PER_PAGE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/caregiver/patients/${patient.id}`}
            className="text-sm text-slate-600 hover:underline"
          >
            ← {patient.displayName}
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Audit log</h1>
          <p className="text-sm text-slate-600 mt-1">
            Last {ROWS_PER_PAGE} actions for this patient. Most recent first.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
          <CardDescription>
            Narrow the list to a single kind of action.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="flex items-end gap-2 max-w-md">
            <div className="flex-1 space-y-1">
              <Label htmlFor="kind">Action kind</Label>
              <select
                id="kind"
                name="kind"
                defaultValue={validKind ?? ""}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                <option value="">All actions</option>
                {auditActionKindEnum.enumValues.map((k) => (
                  <option key={k} value={k}>
                    {ACTION_KIND_LABELS[k] ?? k}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="outline" size="sm">
              Apply
            </Button>
            {validKind && (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/caregiver/patients/${patient.id}/audit`}>
                  Clear
                </Link>
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-600">
          No actions recorded{validKind ? " for this filter" : ""} yet.
        </p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <details
              key={entry.id}
              className="rounded-md border border-slate-200 bg-white px-4 py-3"
            >
              <summary className="flex cursor-pointer items-baseline justify-between gap-4 text-sm">
                <div>
                  <span className="font-medium">
                    {ACTION_KIND_LABELS[entry.actionKind] ?? entry.actionKind}
                  </span>
                  <span className="ml-2 text-xs text-slate-500">
                    on {entry.targetKind}
                    {entry.targetId ? ` · ${entry.targetId.slice(0, 8)}…` : ""}
                  </span>
                </div>
                <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
                  {formatTimestamp(entry.createdAt)}
                </span>
              </summary>
              <div className="mt-3 grid md:grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="font-medium uppercase tracking-wide text-slate-500 mb-1">
                    Before
                  </div>
                  <pre className="rounded bg-slate-50 p-3 overflow-auto whitespace-pre-wrap break-words">
                    {prettyJson(entry.before)}
                  </pre>
                </div>
                <div>
                  <div className="font-medium uppercase tracking-wide text-slate-500 mb-1">
                    After
                  </div>
                  <pre className="rounded bg-slate-50 p-3 overflow-auto whitespace-pre-wrap break-words">
                    {prettyJson(entry.after)}
                  </pre>
                </div>
                {entry.note && (
                  <div className="md:col-span-2">
                    <div className="font-medium uppercase tracking-wide text-slate-500 mb-1">
                      Note
                    </div>
                    <p className="text-sm text-slate-700">{entry.note}</p>
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
