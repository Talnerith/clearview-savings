// Route-level loading state for every patient page under /patient/[id]
// (M9 visual review): server-rendered navigations previously gave no
// feedback between click and next page, so a press could feel ignored.
// This renders instantly inside the chrome layout — header band stays,
// the content area shows a calm spinner. No forbidden vocabulary, no
// percentages or progress bars: just "One moment…", the way a teller
// would say it.
export default function PatientLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex max-w-6xl items-center justify-center gap-4 px-8 py-24"
    >
      <span
        aria-hidden="true"
        className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-800"
      />
      <p className="text-2xl text-slate-700">One moment…</p>
    </div>
  );
}
