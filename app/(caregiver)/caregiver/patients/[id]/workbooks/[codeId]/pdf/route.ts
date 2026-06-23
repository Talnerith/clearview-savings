import { and, eq, isNotNull } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";

import { getPatientForCaregiver } from "@/lib/auth/require-patient";
import { db } from "@/lib/db";
import { depositCodes } from "@/lib/db/schema";
import { renderWorkbookPdfStream } from "@/lib/workbook-pdf";
import type { WorkbookSample } from "@/lib/workbook-content/types";

type PatientSettings = {
  font_size?: string;
  locale?: string;
  currency?: string;
};

function readLocale(raw: unknown): string {
  if (raw && typeof raw === "object") {
    const r = raw as PatientSettings;
    if (typeof r.locale === "string") return r.locale;
  }
  return "en-US";
}

function readCurrency(raw: unknown): string {
  if (raw && typeof raw === "object") {
    const r = raw as PatientSettings;
    if (typeof r.currency === "string") return r.currency;
  }
  return "USD";
}

function isWorkbookSample(value: unknown): value is WorkbookSample {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<WorkbookSample>;
  return (
    typeof v.seed === "string" &&
    typeof v.kind === "string" &&
    typeof v.grade === "number" &&
    Array.isArray(v.pages)
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; codeId: string }> },
): Promise<Response> {
  const { id, codeId } = await params;

  const { patient } = await getPatientForCaregiver(id);

  const rows = await db
    .select()
    .from(depositCodes)
    .where(
      and(
        eq(depositCodes.id, codeId),
        eq(depositCodes.patientId, patient.id),
        // A workbook is identified by its content, not code kind — the reward
        // is minted as kind = "check" since M8 (ADR 0004).
        isNotNull(depositCodes.workbookKind),
      ),
    )
    .limit(1);
  const code = rows[0];
  if (!code || !isWorkbookSample(code.contentSeed)) {
    return NextResponse.redirect(
      new URL(
        `/caregiver/patients/${patient.id}/workbooks?error=Workbook%20not%20found`,
        request.url,
      ),
    );
  }

  const nodeStream = await renderWorkbookPdfStream({
    patient,
    title: code.label,
    code: code.code,
    createdAt: code.createdAt,
    sample: code.contentSeed,
    locale: readLocale(patient.settings),
    amountCents: code.amountCents,
    currency: readCurrency(patient.settings),
  });

  const webStream = Readable.toWeb(
    nodeStream as Readable,
  ) as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="clearview-savings-workbook-${code.code}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
