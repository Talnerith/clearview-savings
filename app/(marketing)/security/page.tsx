export const metadata = {
  title: "Security",
  description:
    "How Clearview Savings handles security, and how to report a vulnerability.",
};

export default function SecurityPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-12 text-slate-700 leading-relaxed">
      <h1 className="text-3xl font-semibold text-slate-900">Security</h1>

      <p className="mt-6 rounded-md border border-slate-300 bg-white px-4 py-3 text-slate-800">
        <strong className="font-semibold">Clearview Savings is a
        memory-care companion application, not a real financial
        institution.</strong>{" "}
        The data we hold is simulated banking display data, caregiver email
        addresses, and the display names of the people caregivers set up.
        We do not handle real banking credentials or real money.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">
        Reporting a vulnerability
      </h2>
      <p className="mt-3">
        If you believe you have found a security issue, please email{" "}
        <a
          className="font-medium text-emerald-800 underline"
          href="mailto:security@clearviewsavings.com"
        >
          security@clearviewsavings.com
        </a>{" "}
        with a short description and reproduction steps. We will reply
        within seven days to acknowledge the report and to coordinate a fix
        and disclosure window.
      </p>
      <p className="mt-3">
        Please do not test against other caregivers&rsquo; accounts, do not
        run automated scans that generate significant traffic, and do not
        publish details of an issue before we have had a chance to address
        it. Good-faith research that follows these limits is welcome.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">
        Security posture
      </h2>
      <ul className="mt-3 list-disc pl-6 space-y-2">
        <li>
          <strong>Authentication.</strong> Email + password via Supabase
          Auth, with mandatory email confirmation before a caregiver
          dashboard becomes reachable.
        </li>
        <li>
          <strong>Multi-tenancy.</strong> Every data row in the database is
          gated by PostgreSQL Row-Level Security policies keyed to the
          caregiver id. Cross-tenant access is prevented at the database
          layer, not just in application code.
        </li>
        <li>
          <strong>Encryption.</strong> All traffic to the application is
          over TLS. The Supabase-managed database is encrypted at rest.
        </li>
        <li>
          <strong>Transactional email.</strong> Sent via Resend with SPF,
          DKIM, and DMARC alignment on{" "}
          <span className="font-mono text-sm">clearviewsavings.com</span>.
          No marketing email is sent under any circumstance.
        </li>
        <li>
          <strong>Error tracking.</strong> Server- and client-side errors
          are captured by Sentry. Session replay is disabled to keep
          patient-visible screens out of any captured trace.
        </li>
        <li>
          <strong>Rate limiting.</strong> Sign-up, sign-in, and
          password-reset endpoints are rate-limited per-IP to slow
          credential-stuffing attempts.
        </li>
        <li>
          <strong>No real banking data.</strong> No account numbers, no
          routing numbers, no payment cards, no integration with any real
          financial institution. There is no real money to steal.
        </li>
        <li>
          <strong>No regulated health data.</strong> The product stores no
          diagnoses, no clinical records, and nothing that would meet the
          definitions of PHI under HIPAA or PHIPA.
        </li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">
        Scope of this policy
      </h2>
      <p className="mt-3">
        This policy covers{" "}
        <span className="font-mono text-sm">clearviewsavings.com</span> and
        the application served from it. Third-party services we depend on
        (Supabase, Resend, Sentry, Vercel) publish their own security
        posture; issues you find in them should be reported to those
        providers directly.
      </p>
    </article>
  );
}
