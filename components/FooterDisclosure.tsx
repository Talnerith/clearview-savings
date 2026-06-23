"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Required by Canadian regulators on every page of the app. Wording is fixed
// by CLAUDE.md; the patient-vocab rule explicitly carves out "memory-care
// companion application" here. Do not change copy, remove, or hide via CSS.
//
// "Learn more" target is route-aware so a patient clicking the link from
// /patient/[id]/* lands on the patient-side about page (which only links
// back to their accounts) instead of the caregiver-facing /about (which
// surfaces a Caregiver-dashboard button when the browser holds caregiver
// auth). Each tab has its own URL, so this works correctly even when the
// caregiver is in one tab and the patient is in another.
export function FooterDisclosure() {
  const pathname = usePathname();
  const patientMatch = pathname?.match(/^\/patient\/([^/]+)/);
  const aboutHref = patientMatch
    ? `/patient/${patientMatch[1]}/about`
    : "/about";

  return (
    <footer
      role="contentinfo"
      className="border-t border-slate-200 px-6 py-6 text-center text-xs leading-relaxed text-slate-500"
    >
      Clearview Savings is a memory-care companion application.{" "}
      <Link
        href={aboutHref}
        className="underline-offset-4 hover:underline focus:outline-none focus-visible:underline"
      >
        Learn more
      </Link>
      .
    </footer>
  );
}
