export const metadata = {
  title: "Terms",
  description: "Terms of use for the Clearview Savings beta.",
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-12 text-slate-700 leading-relaxed">
      <h1 className="text-3xl font-semibold text-slate-900">Terms of use</h1>

      <p className="mt-6 rounded-md border border-slate-300 bg-white px-4 py-3 text-slate-800">
        <strong className="font-semibold">Clearview Savings is a
        memory-care companion application, not a real financial
        institution.</strong>{" "}
        It is offered as-is, free of charge during the current beta period,
        with no warranty of any kind.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">
        What this service is
      </h2>
      <p className="mt-3">
        A simulated banking interface that a caregiver sets up and controls
        on behalf of someone living with Alzheimer&rsquo;s or another form
        of dementia. The display amounts, scheduled deposits, and printable
        checks are not real money and do not represent any actual account
        held at any institution.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">
        What this service is not
      </h2>
      <ul className="mt-3 list-disc pl-6 space-y-2">
        <li>Not a bank, not a credit union, not a payment processor.</li>
        <li>Not a substitute for a real financial account or for managing real
          money.</li>
        <li>Not a clinical product, not medical advice, not a substitute for
          professional dementia care.</li>
        <li>Not a regulated financial service in any jurisdiction.</li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">
        Beta &amp; pricing
      </h2>
      <p className="mt-3">
        Free for the duration of the current beta. No paid tier exists
        today. If pricing is ever introduced you will be notified in advance
        by email and your existing account will not be charged without your
        explicit opt-in.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">
        Caregiver responsibility
      </h2>
      <p className="mt-3">
        You set up and operate the account on behalf of the person you care
        for. You decide what to show them, when, and in what amounts. You
        are responsible for keeping the patient relationship appropriate,
        and for the consent and care that the simulated environment
        approach requires. We do not supervise that relationship, and we do
        not verify the identity of the person you set up.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">
        No warranty
      </h2>
      <p className="mt-3">
        The service is provided &ldquo;as is&rdquo; with no warranty
        whatsoever, express or implied. We make no guarantee that the
        service will always be available, that data will never be lost, or
        that the interface will produce any particular therapeutic outcome.
        To the maximum extent permitted by applicable law, we disclaim all
        liability for loss arising from use of the service.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">
        Acceptable use
      </h2>
      <p className="mt-3">
        Use the service only for its intended purpose: to support someone
        in your care who is living with dementia or another memory-related
        condition. Do not attempt to impersonate any real financial
        institution, do not use the simulated interface to defraud or
        deceive anyone outside the caregiving relationship, and do not
        attempt to disrupt the service for other users.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">Changes</h2>
      <p className="mt-3">
        These terms may change as the product matures. Material changes
        will be announced by email to the address on your account.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">Contact</h2>
      <p className="mt-3">
        Questions about these terms:{" "}
        <a
          className="font-medium text-emerald-800 underline"
          href="mailto:support@clearviewsavings.com"
        >
          support@clearviewsavings.com
        </a>
        .
      </p>
    </article>
  );
}
