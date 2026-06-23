import Link from "next/link";

// Small footer-nav row of the four legal pages. Mounted in marketing,
// caregiver, and auth layouts so any of those pages can reach any other.
// Deliberately NOT mounted in the patient layout — the FooterDisclosure
// already exposes /about there for regulatory compliance, and adding three
// more clickable links would broaden the surface a patient could tap into
// the simulation-explanation pages.
//
// `support` adds a quiet "Support this project" link to the row. It is
// gated to the caregiver layout only (passed explicitly there) and never
// renders on the patient side — the patient must never see a donation
// prompt. The Ko-fi URL comes from NEXT_PUBLIC_KOFI_URL so no placeholder
// link ships; the item is omitted entirely when the var is unset.
export function LegalLinksNav({ support = false }: { support?: boolean }) {
  const kofiUrl = process.env.NEXT_PUBLIC_KOFI_URL;

  return (
    <nav className="mx-auto max-w-6xl px-8 pb-2 pt-6">
      <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-600">
        <li>
          <Link href="/about" className="hover:underline">
            About
          </Link>
        </li>
        <li>
          <Link href="/privacy" className="hover:underline">
            Privacy
          </Link>
        </li>
        <li>
          <Link href="/terms" className="hover:underline">
            Terms
          </Link>
        </li>
        <li>
          <Link href="/security" className="hover:underline">
            Security
          </Link>
        </li>
        {support && kofiUrl && (
          <li>
            <a
              href={kofiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              Support this project
            </a>
          </li>
        )}
      </ul>
    </nav>
  );
}
