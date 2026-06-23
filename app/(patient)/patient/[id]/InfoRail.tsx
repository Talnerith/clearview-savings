// Decorative information rail (ADR 0006): the believability filler that
// every real online-banking page carries down its right side. The Messages
// and Security Reminder panels are genuine, truthful text (there really are
// no messages; we really will never ask for a password). The Quick Links
// panel is set dressing: link-colored but non-interactive, aria-hidden so
// assistive tech never offers a dead control. Nothing here competes with
// the page's one primary action.

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 space-y-2 text-lg text-slate-700">{children}</div>
    </section>
  );
}

function DecorativeLinks({ items }: { items: string[] }) {
  return (
    <ul aria-hidden="true" className="space-y-2">
      {items.map((label) => (
        <li
          key={label}
          className="select-none text-lg font-medium text-emerald-800"
        >
          {label}
        </li>
      ))}
    </ul>
  );
}

export function InfoRail({ variant }: { variant: "home" | "account" }) {
  return (
    <aside className="space-y-6">
      {variant === "home" ? (
        <Panel title="Messages">
          <p>You have no new messages.</p>
        </Panel>
      ) : (
        <Panel title="Account Services">
          <DecorativeLinks
            items={[
              "View Statements",
              "Order Checks",
              "Tax Documents",
              "Direct Deposit Form",
            ]}
          />
        </Panel>
      )}

      <Panel title="Security Reminder">
        <p>
          We will never call or email you to ask for your password or a
          deposit code.
        </p>
      </Panel>

      {variant === "home" && (
        <Panel title="Quick Links">
          <DecorativeLinks
            items={[
              "Account Statements",
              "Order Checks",
              "Tax Documents",
              "Direct Deposit Form",
            ]}
          />
        </Panel>
      )}
    </aside>
  );
}
