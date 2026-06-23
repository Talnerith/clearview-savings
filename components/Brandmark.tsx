type Size = "sm" | "md" | "lg";

// Icon HEIGHT in pixels. Width is auto so the natural ~2.2:1 aspect of the
// cropped sun+wave mark drives the rendered size. The SVG file's viewBox
// crops to just the mark (no in-SVG wordmark) so it can sit next to the text
// wordmark below without duplication.
const ICON_PX: Record<Size, number> = { sm: 32, md: 48, lg: 64 };
const TEXT_CLASS: Record<Size, string> = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-3xl",
};

// Default is the fixed public service brand from CLAUDE.md. Patient routes
// thread `name={brand.name}` through getPatientBrand() so the indirection
// stays exercised; the resolved value is always "Clearview Savings" per
// ADR 0002 (per-patient brand override cancelled).
export function Brandmark({
  name = "Clearview Savings",
  size = "md",
  className = "",
}: {
  name?: string;
  size?: Size;
  className?: string;
}) {
  const h = ICON_PX[size];
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/branding/clearview-savings-icon.svg"
        alt=""
        style={{ height: `${h}px`, width: "auto" }}
        className="shrink-0"
      />
      <span className={`font-semibold tracking-tight ${TEXT_CLASS[size]}`}>
        {name}
      </span>
    </span>
  );
}
