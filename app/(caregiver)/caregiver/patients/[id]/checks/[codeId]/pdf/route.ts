import { and, eq, isNull } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";

import { getPatientForCaregiver } from "@/lib/auth/require-patient";
import { renderCheckPdfStream } from "@/lib/check-pdf";
import { db } from "@/lib/db";
import { depositCodes } from "@/lib/db/schema";

type PatientSettings = {
  font_size?: string;
  locale?: string;
  currency?: string;
};

function readSettings(raw: unknown): { locale: string; currency: string } {
  if (raw && typeof raw === "object") {
    const r = raw as PatientSettings;
    return {
      locale: typeof r.locale === "string" ? r.locale : "en-US",
      currency: typeof r.currency === "string" ? r.currency : "USD",
    };
  }
  return { locale: "en-US", currency: "USD" };
}

export async function GET(
  _request: NextRequest,
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
        eq(depositCodes.kind, "check"),
        // Plain checks only — a workbook reward (also kind = "check" since M8)
        // prints via the workbooks PDF route, not here.
        isNull(depositCodes.workbookKind),
      ),
    )
    .limit(1);
  const code = rows[0];
  if (!code) {
    return NextResponse.redirect(
      new URL(`/caregiver/patients/${patient.id}/checks?error=Check%20not%20found`, _request.url),
    );
  }

  const settings = readSettings(patient.settings);

  const nodeStream = await renderCheckPdfStream({
    patient,
    payeeName: patient.displayName,
    amountCents: code.amountCents,
    date: code.createdAt,
    memo: code.memo,
    code: code.code,
    locale: settings.locale,
    currency: settings.currency,
  });

  // Bridge Node ReadableStream -> Web ReadableStream so Next.js can return
  // it. Readable.toWeb (Node 18+) does the conversion natively.
  const webStream = Readable.toWeb(
    nodeStream as Readable,
  ) as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      // `inline` so the browser opens the PDF in the tab; the caregiver can
      // print from there without downloading.
      "Content-Disposition": `inline; filename="clearview-savings-check-${code.code}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
