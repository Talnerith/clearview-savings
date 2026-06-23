// Patient route group: deliberately minimal chrome. No nav, no logout, no
// auth UI — the patient should see something that looks like a familiar bank
// web page, nothing else. The single piece of non-banking chrome on these
// pages is the disclosure footer (rendered by the root layout) — required
// by Canadian regulators and explicitly carved out in CLAUDE.md.
export default function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-[20px] leading-relaxed text-slate-900 antialiased">
      {children}
    </div>
  );
}
