export const metadata = {
  title: "Privacy",
  description:
    "What Clearview Savings collects, how it is stored, and how to delete it.",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-12 text-slate-700 leading-relaxed">
      <h1 className="text-3xl font-semibold text-slate-900">Privacy</h1>

      <p className="mt-6 rounded-md border border-slate-300 bg-white px-4 py-3 text-slate-800">
        <strong className="font-semibold">Clearview Savings is a
        memory-care companion application, not a real financial
        institution.</strong>{" "}
        It does not collect, hold, or transmit real financial credentials,
        account numbers, or money.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">
        What we collect
      </h2>
      <ul className="mt-3 list-disc pl-6 space-y-2">
        <li>
          <strong>Caregiver email and password.</strong> Used to sign you
          in.
        </li>
        <li>
          <strong>Display names of the people you set up.</strong> You
          decide what to call them inside the application &mdash; first
          name, nickname, or any label that feels right.
        </li>
        <li>
          <strong>Simulated account data you create.</strong> Account names,
          scheduled deposit amounts, generated transactions, and the
          single-use codes printed on checks. All of this is data{" "}
          <em>you enter</em>; none of it is fetched from any real bank.
        </li>
        <li>
          <strong>Operational logs.</strong> Standard server logs, error
          reports, and basic usage analytics necessary to keep the service
          running.
        </li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">
        What we don&rsquo;t collect
      </h2>
      <ul className="mt-3 list-disc pl-6 space-y-2">
        <li>Real bank account numbers, routing numbers, or balances.</li>
        <li>Payment-card information of any kind.</li>
        <li>Health records, diagnoses, or anything covered by HIPAA / PHIPA.</li>
        <li>The contents of any photo a person uploads in the &ldquo;deposit a
          check&rdquo; flow &mdash; the upload is accepted and immediately
          discarded.</li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">
        Where data is stored
      </h2>
      <p className="mt-3">
        On Supabase (Postgres + Auth) hosted in the United States.
        Connections are encrypted in transit; the database is encrypted at
        rest. Row-Level Security policies restrict every record to the
        caregiver who owns it.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">
        Email handling
      </h2>
      <p className="mt-3">
        Confirmation and password-reset email is sent via Resend, signed
        with SPF, DKIM, and DMARC for {""}
        <span className="font-mono text-sm">clearviewsavings.com</span>. We
        send transactional email only &mdash; no marketing, no newsletters,
        and no promotions, ever.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">
        Sharing and selling
      </h2>
      <p className="mt-3">
        We do not sell, rent, or share your data with any third party for
        marketing or advertising. The data lives in our hosted database and
        is accessible only to you, our service providers (Supabase, Resend,
        Sentry for error reports, Vercel for hosting), and our own
        operators when investigating an issue you have reported.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">
        Retention and deletion
      </h2>
      <p className="mt-3">
        Self-serve account deletion is not yet built. To delete your
        account and all associated patient and account data, email{" "}
        <a
          className="font-medium text-emerald-800 underline"
          href="mailto:support@clearviewsavings.com"
        >
          support@clearviewsavings.com
        </a>{" "}
        from the address on the account. We will confirm and complete the
        deletion within seven days.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">Contact</h2>
      <p className="mt-3">
        Privacy questions:{" "}
        <a
          className="font-medium text-emerald-800 underline"
          href="mailto:privacy@clearviewsavings.com"
        >
          privacy@clearviewsavings.com
        </a>
        .
      </p>
    </article>
  );
}
