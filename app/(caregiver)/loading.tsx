// Route-level loading state for the caregiver area (M9 round 2): the same
// instant click-feedback the patient side gets, at caregiver density.
export default function CaregiverLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex max-w-6xl items-center justify-center gap-3 px-8 py-24"
    >
      <span
        aria-hidden="true"
        className="inline-block h-6 w-6 animate-spin rounded-full border-[3px] border-emerald-200 border-t-emerald-700"
      />
      <p className="text-base text-slate-600">Loading…</p>
    </div>
  );
}
