import { redirect } from "next/navigation";

// Calm fallback for any unknown patient sub-path — e.g. a stale
// /patient/[id]/submit-work bookmark after M8 (ADR 0004) removed that flow.
// The patient-UX rules forbid showing a 404; send them home instead, where
// the finished-work reward is now claimed through "Deposit a Check". Explicit
// sibling routes (deposit, accounts, about) take routing precedence over this
// catch-all, so only genuinely unmatched paths land here.
export default async function PatientUnknownRoute({
  params,
}: {
  params: Promise<{ id: string; slug: string[] }>;
}) {
  const { id } = await params;
  redirect(`/patient/${id}`);
}
