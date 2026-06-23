import { eq } from "drizzle-orm";
import Link from "next/link";

import { Brandmark } from "@/components/Brandmark";
import { getPatientBrand } from "@/lib/branding";
import { db } from "@/lib/db";
import { patients } from "@/lib/db/schema";

import { formatDateLong, readSettings } from "./patient-format";
import { PatientNav } from "./PatientNav";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Persistent bank chrome for every patient page (M9): a white header bar
// with the brand at left and today's date at right — the strongest "this is
// my bank" cue from mainstream banking sites, kept on every screen so the
// patient is never disoriented by a chrome-less page. Patient lookup is
// best-effort: on any failure the header still renders with the default
// brand, so calm-fallback pages keep their chrome.
export default async function PatientChromeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let patient: typeof patients.$inferSelect | undefined;
  if (UUID_RE.test(id)) {
    try {
      const rows = await db
        .select()
        .from(patients)
        .where(eq(patients.id, id))
        .limit(1);
      patient = rows[0];
    } catch {
      // header renders with the default brand
    }
  }

  const brand = getPatientBrand(patient ?? null);
  const settings = readSettings(patient?.settings);

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        {/* Desktop-width chrome (ADR 0005): the patient site is a dedicated
            PC experience, so the header spans a real desktop container. */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-8 py-5">
          <Link href={`/patient/${id}`} aria-label={`${brand.name} home`}>
            <Brandmark name={brand.name} size="lg" />
          </Link>
          <div className="text-xl text-slate-700">
            {formatDateLong(new Date(), settings)}
          </div>
        </div>
      </header>
      <PatientNav patientId={id} />
      <main>{children}</main>
    </>
  );
}
