"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Bank-style navigation strip (ADR 0006): real online banking is visually
// busy — a sparse page reads "not my bank" to the patient. Only the two
// items the product actually has navigate: "My Accounts" (home) and
// "Deposit a Check". The remaining items are deliberate set dressing —
// non-interactive spans, default cursor, aria-hidden so assistive tech
// never offers a dead control. Clicking them does nothing, which is calmer
// than an empty page or an error.
const DECORATIVE_ITEMS = [
  "Transfers",
  "Bill Payments",
  "Statements",
  "Profile & Settings",
  "Help",
];

function NavLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`border-b-[3px] py-3 text-lg font-medium text-white transition ${
        current
          ? "border-white"
          : "border-transparent hover:border-emerald-200"
      }`}
    >
      {children}
    </Link>
  );
}

export function PatientNav({ patientId }: { patientId: string }) {
  const pathname = usePathname();
  const home = `/patient/${patientId}`;
  const onDeposit = pathname.startsWith(`${home}/deposit`);

  return (
    <nav aria-label="Account navigation" className="bg-emerald-900">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-9 px-8">
        <NavLink href={home} current={!onDeposit}>
          My Accounts
        </NavLink>
        <NavLink href={`${home}/deposit`} current={onDeposit}>
          Deposit a Check
        </NavLink>
        {DECORATIVE_ITEMS.map((label) => (
          <span
            key={label}
            aria-hidden="true"
            className="select-none border-b-[3px] border-transparent py-3 text-lg font-medium text-white"
          >
            {label}
          </span>
        ))}
      </div>
    </nav>
  );
}
