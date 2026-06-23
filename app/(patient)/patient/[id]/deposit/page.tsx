import { eq } from "drizzle-orm";
import type { Metadata } from "next";

import { getPatientBrand, getPatientBrandById } from "@/lib/branding";
import { db } from "@/lib/db";
import { patients } from "@/lib/db/schema";

import { WelcomeFallback } from "../WelcomeFallback";
import DepositWizard from "./DepositWizard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const brand = await getPatientBrandById(id);
  return { title: `${brand.name} — Deposit a Check` };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DepositPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const isUuid = UUID_RE.test(id);
  let rows: (typeof patients.$inferSelect)[] = [];
  if (isUuid) {
    try {
      rows = await db
        .select()
        .from(patients)
        .where(eq(patients.id, id))
        .limit(1);
    } catch {
      return <WelcomeFallback brandName={getPatientBrand().name} />;
    }
  }
  const patient = rows[0];

  if (!patient) {
    return <WelcomeFallback brandName={getPatientBrand().name} />;
  }

  return (
    // Narrower than the home/account pages: the wizard is a focused
    // one-action flow, not a data page — but sized for a desktop window
    // (ADR 0005), not a phone column.
    <div className="mx-auto max-w-3xl px-8 py-12">
      <DepositWizard patientId={patient.id} />
    </div>
  );
}
