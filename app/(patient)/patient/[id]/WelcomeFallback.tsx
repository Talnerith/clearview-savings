// Calm fallback panel for any patient page that can't resolve its data
// (unknown id, DB hiccup). Renders inside the patient chrome layout, which
// already shows the brand header — so this is message-only, no Brandmark.
export function WelcomeFallback({ brandName }: { brandName: string }) {
  return (
    <div className="mx-auto max-w-3xl px-8 py-24 text-center">
      <p className="text-2xl text-slate-700">
        Welcome to {brandName}. Please use the link your family shared with
        you.
      </p>
    </div>
  );
}
