export const metadata = {
  title: "About",
  description:
    "Clearview Savings is a memory-care companion application, not a real financial institution.",
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-12 text-slate-700 leading-relaxed">
      <h1 className="text-3xl font-semibold text-slate-900">
        About Clearview Savings
      </h1>

      <p className="mt-6 rounded-md border border-slate-300 bg-white px-4 py-3 text-slate-800">
        <strong className="font-semibold">Clearview Savings is a
        memory-care companion application, not a real financial
        institution.</strong>{" "}
        It does not hold money, does not connect to any real bank, and does
        not process payments of any kind.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">
        What it is
      </h2>
      <p className="mt-3">
        Clearview Savings is a simulated banking interface that a caregiver
        sets up and controls on behalf of someone living with Alzheimer&rsquo;s
        or another form of dementia. The person they care for sees a calm,
        familiar bank-style page showing their balance, recent deposits, and
        scheduled income. The caregiver controls the contents behind the
        scenes.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">Who it&rsquo;s for</h2>
      <p className="mt-3">
        Families and professional caregivers supporting a person in
        mid-stage memory loss who experiences recurring anxiety about money
        &mdash; missing pensions, unpaid bills, lost funds. The product
        won&rsquo;t help everyone with dementia and isn&rsquo;t a substitute
        for clinical care. It is one small, calm tool a caregiver can choose
        to add to the routine if money-anxiety is a recurring problem.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">How it works</h2>
      <p className="mt-3">
        Caregivers create an account, add the person they care for, and
        schedule recurring deposits or generate one-off printable checks
        with single-use codes. The cared-for person opens a bank-style page,
        sees the balance and recent activity, and can return to it as often
        as they need to feel reassured. No real money is involved; the
        amounts are entirely controlled by the caregiver.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">Why it exists</h2>
      <p className="mt-3">
        Repeating &ldquo;your pension is fine&rdquo; ten times a day stops
        working in mid-stage dementia. Showing a calm screen the person can
        check themselves often does. This approach &mdash; sometimes called a{" "}
        <em>simulated environment</em> in dementia-care literature &mdash; is
        the same idea behind the prop wallets, fake mail, and demo ATMs that
        memory-care facilities have used for decades. Clearview Savings makes
        a small piece of that approach available to families at home.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">
        Why the interface looks like a real bank
      </h2>
      <p className="mt-3">
        The therapeutic effect depends on the screen feeling familiar.
        Anything that signals &ldquo;this is a fake&rdquo; defeats the
        purpose. So inside the application, the person sees a clean,
        ordinary bank-style page. Caregivers, regulators, and family members
        see this About page, the footer disclosure on every screen, and the
        Privacy / Terms / Security pages linked from it, all stating
        plainly what the product is.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">Contact</h2>
      <p className="mt-3">
        Questions and feedback:{" "}
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
