# 0002 — No per-patient brand override

## Context

The original Clearview Savings plan included a Milestone 6 feature
allowing caregivers to override the patient-facing brand name from the
default "Clearview Savings" to the name of their patient's actual
former bank — "First National," "Heritage Trust," etc. — for maximum
therapeutic effect. The premise: a patient with mid-stage dementia
who banked with a specific institution for fifty years recognizes
that name; "Clearview Savings" is one more unfamiliar thing in a
world that's getting less familiar by the month.

Two legal constraints kill this:

- **Canadian Bank Act, Section 983.** Non-licensed entities are
  restricted from using "bank," "banking," "banker," and — critically
  for this decision — names that suggest the entity is, or is
  associated with, a Schedule I/II/III bank. A caregiver typing
  "Royal Bank of Canada" or "TD Bank" into our brand-override field
  makes Clearview Savings the publisher of a UI that uses that bank's
  name. The legal exposure sits with us, not the caregiver.
- **Trademark and passing-off jurisprudence.** Even without the Bank
  Act, displaying another financial institution's trade name and
  visual identity (which a believable simulation would require)
  exposes us to trademark infringement and passing-off claims from
  the real bank, regardless of disclaimer text or therapeutic
  intent. Canadian courts have been clear that the *therapeutic
  purpose* defence is narrow and untested for digital products.

The therapeutic benefit is real but bounded — patients respond to
calm, predictable bank-like UI generally, not specifically to one
brand. The legal exposure is unbounded and concentrated on the
operator.

## Decision

Per-patient brand override is **cancelled, not deferred**. All
patients see "Clearview Savings" permanently. The
`getPatientBrand(patient)` indirection in `lib/branding.ts` remains
in place — it costs nothing and provides forward flexibility if a
future legal or product reason justifies overriding the brand for
some bounded use case (e.g., localization, white-labeling for a
memory-care facility under their own brand) — but it has no current
swap target.

## Alternatives considered

- **Allow caregivers to configure the brand to anything they want
  with a legal-disclaimer checkbox.** Rejected: the disclaimer
  shifts no liability under Canadian law, and the operator (us)
  remains responsible for what the deployed UI shows. The
  caregiver clicking a checkbox does not make the deployment
  lawful.
- **Restrict the override field to a whitelist of bank names we
  pre-vet for legal exposure.** Rejected: maintaining a per-name
  whitelist is its own operational burden, the vetting is
  expensive (legal review per name across two countries), and the
  whitelist is necessarily incomplete — the long tail of regional
  credit unions and former banks is exactly where this feature
  would have provided value.
- **Build the feature but gate it behind a licensed-jurisdiction
  flag.** Rejected: we operate from Canada under Canadian law
  regardless of where the patient is. A US-licensed deployment is
  not on the roadmap and would require entity-level legal work
  far outside this product's scope.
- **Defer to a later milestone.** Rejected: deferral implies the
  feature might still happen if the legal landscape changes. The
  legal landscape is not changing in our direction; explicit
  cancellation is more honest and saves future-us from
  re-evaluating a settled question.

## Consequences

**Good:**

- Zero legal exposure to bank impersonation claims. The brand
  surface presented to patients is one fictional name we own and
  control, with the regulatory disclosure footer on every page
  that surface reaches.
- Simpler product. No brand-override UI to build, no settings
  field to validate, no per-patient brand asset pipeline (logo,
  colors, fonts) to maintain.
- Simpler ops. One brand to monitor, one trademark to defend
  (Clearview Savings itself), one set of legal pages.

**Costs / commitments:**

- Patients whose recognition of a specific former-bank brand
  would have helped won't get that help from us. This is a real
  therapeutic loss, weighed against the legal exposure and judged
  not worth it.
- The `getPatientBrand()` indirection in `lib/branding.ts` and
  all its call sites (patient pages, check PDFs, workbook PDFs,
  email templates) remain in the codebase as load-bearing today
  while reading as legacy-feeling forever. Acceptable — the
  indirection costs almost nothing and a future "we want to
  white-label this for memory-care facility X under their own
  brand" use case would re-activate it.
- The CLAUDE.md branding architecture section needs updating to
  match this decision. Done in the same commit as this ADR.

## Date

2026-05-19
