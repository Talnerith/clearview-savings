import { formatArrival } from "@/lib/format-arrival";
import type { PendingDepositItem } from "@/lib/scheduled-deposits/pending";

type Settings = {
  locale: string;
  currency: string;
};

type Props = {
  items: PendingDepositItem[];
  settings: Settings;
  now: Date;
  showAccountSuffix: boolean;
};

function formatMoney(cents: number, s: Settings): string {
  return new Intl.NumberFormat(s.locale, {
    style: "currency",
    currency: s.currency,
    currencyDisplay: "narrowSymbol",
  }).format(cents / 100);
}

export function PendingBanner({
  items,
  settings,
  now,
  showAccountSuffix,
}: Props) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 space-y-4 shadow-sm">
      <h2 className="text-2xl text-emerald-900">Direct Deposit Pending</h2>
      <ul className="divide-y divide-emerald-100">
        {items.map((item) => {
          const arrival = formatArrival(
            item.nextRunAt,
            now,
            settings.locale,
          );
          const amount = formatMoney(item.amountCents, settings);
          const suffix = showAccountSuffix
            ? ` in your ${item.accountName} account`
            : "";
          return (
            <li key={item.scheduledDepositId} className="py-3">
              <p className="text-xl text-emerald-950">
                {item.label} of {amount} will arrive {arrival}
                {suffix}.
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
