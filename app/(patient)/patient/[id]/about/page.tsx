import type { Metadata } from "next";
import Link from "next/link";

import { getPatientBrandById } from "@/lib/branding";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const brand = await getPatientBrandById(id);
  return { title: `${brand.name} — About` };
}

// Patient-side disclosure page. Reached only from the FooterDisclosure on
// /patient/[id]/* routes. Identical regulatory disclosure wording to the
// caregiver-facing /about, but renders inside the patient route group with
// a single Return-to-your-accounts navigation path. No caregiver-dashboard
// button, no legal-page links, no marketing nav — the bank illusion holds
// even when the patient (or a curious family member) follows the disclosure
// link from a patient session.
export default async function PatientAboutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const brand = await getPatientBrandById(id);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-10">
      <article className="space-y-6 text-slate-700 leading-relaxed">
        <h1 className="text-3xl font-semibold text-slate-900">
          About {brand.name}
        </h1>

        <div className="rounded-md border border-slate-300 bg-white px-4 py-3 text-slate-800">
          <p>
            <strong className="font-semibold">
              {brand.name} is a memory-care companion application, not a real
              financial institution.
            </strong>{" "}
            It does not hold money, does not connect to any real bank, and
            does not process payments of any kind.
          </p>
        </div>

        <p>
          The screens you see are calm, familiar, and predictable by design.
          A family member or caregiver sets up the account on your behalf
          and manages the contents — the balances, deposits, and checks you
          see are for your comfort and reassurance.
        </p>

        <p>
          If you have questions, the family member who set this up for you
          is the best person to ask.
        </p>
      </article>

      <section>
        <Link
          href={`/patient/${id}`}
          className="inline-block rounded-md bg-emerald-700 px-6 py-3 text-lg font-medium text-white transition hover:bg-emerald-800 active:bg-emerald-900"
        >
          Return to your accounts
        </Link>
      </section>
    </div>
  );
}
