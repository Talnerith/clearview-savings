import { asc, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPatientForCaregiver } from "@/lib/auth/require-patient";
import { db } from "@/lib/db";
import {
  accounts,
  scheduledDeposits,
  transactions,
  type Account,
  type ScheduledDeposit,
  type Transaction,
} from "@/lib/db/schema";
import { materializeScheduledDeposits } from "@/lib/scheduled-deposits/materialize";

import {
  addAccountAction,
  addScheduledDepositAction,
  deletePatientAction,
  deleteScheduledDepositAction,
  manualAdjustmentAction,
  renameAccountAction,
  toggleScheduledDepositAction,
  updatePatientSettingsAction,
} from "./actions";
import { ConfirmingForm } from "./ConfirmingForm";
import { transferAction } from "./transfers/actions";

export const metadata = {
  title: "Patient — Clearview Savings",
};

const TX_PER_ACCOUNT = 20;

type PatientSettings = {
  font_size: string;
  locale: string;
  currency: string;
};

function readSettings(raw: unknown): PatientSettings {
  if (raw && typeof raw === "object") {
    const r = raw as Partial<PatientSettings>;
    return {
      font_size: typeof r.font_size === "string" ? r.font_size : "lg",
      locale: typeof r.locale === "string" ? r.locale : "en-US",
      currency: typeof r.currency === "string" ? r.currency : "USD",
    };
  }
  return { font_size: "lg", locale: "en-US", currency: "USD" };
}

function formatMoney(cents: number, settings: PatientSettings): string {
  return new Intl.NumberFormat(settings.locale, {
    style: "currency",
    currency: settings.currency,
    currencyDisplay: "narrowSymbol",
  }).format(cents / 100);
}

function formatDate(d: Date | string, settings: PatientSettings): string {
  const date = typeof d === "string" ? new Date(`${d}T00:00:00Z`) : d;
  return new Intl.DateTimeFormat(settings.locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export default async function CaregiverPatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const { id } = await params;
  const { error, status } = await searchParams;

  const { patient } = await getPatientForCaregiver(id);

  // Materialize any due scheduled-deposit occurrences before reading balances.
  await materializeScheduledDeposits(db, patient.id);

  const patientAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.patientId, patient.id))
    .orderBy(asc(accounts.createdAt));

  const accountIds = patientAccounts.map((a) => a.id);

  const recentTxs: Transaction[] =
    accountIds.length === 0
      ? []
      : await db
          .select()
          .from(transactions)
          .where(inArray(transactions.accountId, accountIds))
          .orderBy(desc(transactions.postedAt))
          .limit(TX_PER_ACCOUNT * Math.max(accountIds.length, 1));

  const scheduled: ScheduledDeposit[] =
    accountIds.length === 0
      ? []
      : await db
          .select()
          .from(scheduledDeposits)
          .where(inArray(scheduledDeposits.accountId, accountIds))
          .orderBy(asc(scheduledDeposits.nextRunAt));

  const settings = readSettings(patient.settings);

  const txByAccount = new Map<string, Transaction[]>();
  for (const tx of recentTxs) {
    const list = txByAccount.get(tx.accountId) ?? [];
    if (list.length < TX_PER_ACCOUNT) list.push(tx);
    txByAccount.set(tx.accountId, list);
  }

  const accountById = new Map<string, Account>(
    patientAccounts.map((a) => [a.id, a]),
  );

  const statusMessages: Record<string, string> = {
    account_added: "Account added.",
    account_renamed: "Account renamed.",
    adjustment_added: "Adjustment posted.",
    scheduled_added: "Scheduled deposit added.",
    scheduled_toggled: "Scheduled deposit updated.",
    scheduled_deleted: "Scheduled deposit deleted.",
    settings_updated: "Patient settings updated.",
    transfer_completed: "Transfer completed.",
  };

  const hasMultipleAccounts = patientAccounts.length >= 2;
  const fromDefault = patientAccounts[0]?.id ?? "";
  const toDefault =
    patientAccounts[patientAccounts.length - 1]?.id ?? "";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/caregiver"
            className="text-sm text-slate-600 hover:underline"
          >
            ← All patients
          </Link>
          <h1 className="text-2xl font-semibold mt-1">{patient.displayName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/caregiver/patients/${patient.id}/checks`}>
              Checks
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/caregiver/patients/${patient.id}/workbooks`}>
              Workbooks
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/caregiver/patients/${patient.id}/audit`}>
              Audit log
            </Link>
          </Button>
          <Button asChild variant="outline">
            <a
              href={`/patient/${patient.id}`}
              target="_blank"
              rel="noreferrer"
            >
              Switch to patient view ↗
            </a>
          </Button>
          <ConfirmingForm
            action={deletePatientAction}
            message={`Delete ${patient.displayName} and all of their accounts, transactions, and history? This can't be undone.`}
          >
            <input type="hidden" name="patientId" value={patient.id} />
            <Button
              type="submit"
              variant="ghost"
              className="text-red-700 hover:text-red-800"
            >
              Delete patient
            </Button>
          </ConfirmingForm>
        </div>
      </div>

      {status && statusMessages[status] && (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {statusMessages[status]}
        </p>
      )}
      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Accounts</h2>
        {patientAccounts.length === 0 ? (
          <p className="text-sm text-slate-600">No accounts yet.</p>
        ) : (
          <div className="space-y-4">
            {patientAccounts.map((account) => {
              const txs = txByAccount.get(account.id) ?? [];
              return (
                <Card key={account.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>{account.name}</CardTitle>
                        <CardDescription className="capitalize">
                          {account.type}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="text-xs uppercase tracking-wide text-slate-500">
                          Balance
                        </div>
                        <div className="text-xl font-semibold tabular-nums">
                          {formatMoney(account.balanceCents, settings)}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {txs.length === 0 ? (
                      <p className="text-sm text-slate-600">
                        No transactions yet.
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="py-2 font-medium">Date</th>
                            <th className="py-2 font-medium">Description</th>
                            <th className="py-2 font-medium">Source</th>
                            <th className="py-2 font-medium text-right">
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {txs.map((tx) => (
                            <tr key={tx.id}>
                              <td className="py-2">
                                {formatDate(tx.postedAt, settings)}
                              </td>
                              <td className="py-2">{tx.label}</td>
                              <td className="py-2 capitalize text-slate-500">
                                {tx.source}
                              </td>
                              <td
                                className={`py-2 text-right tabular-nums ${
                                  tx.amountCents < 0
                                    ? "text-red-700"
                                    : "text-emerald-700"
                                }`}
                              >
                                {formatMoney(tx.amountCents, settings)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <form
                      action={renameAccountAction}
                      className="flex items-end gap-2 border-t pt-4"
                    >
                      <input
                        type="hidden"
                        name="patientId"
                        value={patient.id}
                      />
                      <input
                        type="hidden"
                        name="accountId"
                        value={account.id}
                      />
                      <div className="flex-1 space-y-1">
                        <Label
                          htmlFor={`rename-${account.id}`}
                          className="text-xs"
                        >
                          Rename
                        </Label>
                        <Input
                          id={`rename-${account.id}`}
                          name="name"
                          defaultValue={account.name}
                          required
                          maxLength={40}
                        />
                      </div>
                      <Button type="submit" variant="outline" size="sm">
                        Save
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Scheduled deposits</h2>
        {scheduled.length === 0 ? (
          <p className="text-sm text-slate-600">No scheduled deposits.</p>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 font-medium">Label</th>
                    <th className="py-2 font-medium">Account</th>
                    <th className="py-2 font-medium">Frequency</th>
                    <th className="py-2 font-medium">Next run</th>
                    <th className="py-2 font-medium text-right">Amount</th>
                    <th className="py-2 font-medium text-right">Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {scheduled.map((sd) => {
                    const acct = accountById.get(sd.accountId);
                    return (
                      <tr key={sd.id}>
                        <td className="py-2">{sd.label}</td>
                        <td className="py-2">{acct?.name ?? "—"}</td>
                        <td className="py-2 capitalize">{sd.frequency}</td>
                        <td className="py-2">
                          {formatDate(sd.nextRunAt, settings)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {formatMoney(sd.amountCents, settings)}
                        </td>
                        <td className="py-2 text-right text-xs">
                          {sd.active ? (
                            <span className="text-emerald-700">Active</span>
                          ) : (
                            <span className="text-slate-500">Paused</span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <form action={toggleScheduledDepositAction}>
                              <input
                                type="hidden"
                                name="patientId"
                                value={patient.id}
                              />
                              <input
                                type="hidden"
                                name="depositId"
                                value={sd.id}
                              />
                              <input
                                type="hidden"
                                name="active"
                                value={sd.active ? "false" : "true"}
                              />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="sm"
                              >
                                {sd.active ? "Pause" : "Resume"}
                              </Button>
                            </form>
                            <ConfirmingForm
                              action={deleteScheduledDepositAction}
                              message={`Delete the "${sd.label}" scheduled deposit? Existing transactions stay; future occurrences stop.`}
                            >
                              <input
                                type="hidden"
                                name="patientId"
                                value={patient.id}
                              />
                              <input
                                type="hidden"
                                name="depositId"
                                value={sd.id}
                              />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="sm"
                                className="text-red-700 hover:text-red-800"
                              >
                                Delete
                              </Button>
                            </ConfirmingForm>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        {hasMultipleAccounts ? (
          <Card>
            <CardHeader>
              <CardTitle>Transfer between accounts</CardTitle>
              <CardDescription>
                Move money from one of this patient&rsquo;s accounts to the
                other. Both legs post atomically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={transferAction} className="space-y-4">
                <input type="hidden" name="patientId" value={patient.id} />
                <div className="space-y-2">
                  <Label htmlFor="xfer-from">From</Label>
                  <select
                    id="xfer-from"
                    name="fromAccountId"
                    required
                    defaultValue={fromDefault}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  >
                    {patientAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="xfer-to">To</Label>
                  <select
                    id="xfer-to"
                    name="toAccountId"
                    required
                    defaultValue={toDefault}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  >
                    {patientAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="xfer-amount">Amount</Label>
                  <Input
                    id="xfer-amount"
                    name="amount"
                    inputMode="decimal"
                    placeholder="100.00"
                    required
                  />
                </div>
                <Button type="submit">Transfer</Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Add a savings account</CardTitle>
              <CardDescription>
                Patients get a checking account on creation. Add a savings
                account here when needed; only one savings is allowed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={addAccountAction} className="space-y-4">
                <input type="hidden" name="patientId" value={patient.id} />
                <div className="space-y-2">
                  <Label htmlFor="acct-name">Name</Label>
                  <Input
                    id="acct-name"
                    name="name"
                    placeholder="Savings"
                    defaultValue="Savings"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acct-balance">Starting balance (optional)</Label>
                  <Input
                    id="acct-balance"
                    name="startingBalance"
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-slate-500">
                    Posts an opening adjustment transaction when greater than
                    zero.
                  </p>
                </div>
                <Button type="submit">Add savings account</Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Add a scheduled deposit</CardTitle>
            <CardDescription>
              Recurring deposits like a pension or social security.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={addScheduledDepositAction} className="space-y-4">
              <input type="hidden" name="patientId" value={patient.id} />
              <div className="space-y-2">
                <Label htmlFor="sd-account">Account</Label>
                <select
                  id="sd-account"
                  name="accountId"
                  required
                  defaultValue={patientAccounts[0]?.id ?? ""}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                >
                  {patientAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sd-label">Label</Label>
                <Input
                  id="sd-label"
                  name="label"
                  placeholder="e.g. Pension"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sd-amount">Amount</Label>
                <Input
                  id="sd-amount"
                  name="amount"
                  inputMode="decimal"
                  placeholder="1800.00"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sd-frequency">Frequency</Label>
                <select
                  id="sd-frequency"
                  name="frequency"
                  defaultValue="monthly"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sd-anchor">First date</Label>
                <Input
                  id="sd-anchor"
                  name="anchorDate"
                  type="date"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sd-pending">
                  Show as pending N days before arrival
                </Label>
                <Input
                  id="sd-pending"
                  name="pendingDays"
                  type="number"
                  min={0}
                  max={14}
                  defaultValue={5}
                  required
                />
                <p className="text-xs text-slate-500">
                  How early the patient sees this on their home as a
                  &ldquo;Direct Deposit Pending&rdquo; notice. 0–14, default 5.
                </p>
              </div>
              <Button type="submit" disabled={patientAccounts.length === 0}>
                Add scheduled deposit
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Manual adjustment</CardTitle>
          <CardDescription>
            Post a one-off transaction. Use &ldquo;Adjustment&rdquo; for
            corrections.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={manualAdjustmentAction}
            className="grid md:grid-cols-2 gap-4 max-w-2xl"
          >
            <input type="hidden" name="patientId" value={patient.id} />
            <div className="space-y-2">
              <Label htmlFor="adj-account">Account</Label>
              <select
                id="adj-account"
                name="accountId"
                required
                defaultValue={patientAccounts[0]?.id ?? ""}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                {patientAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adj-kind">Kind</Label>
              <select
                id="adj-kind"
                name="kind"
                defaultValue="deposit"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
                <option value="fee">Fee</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adj-amount">Amount</Label>
              <Input
                id="adj-amount"
                name="amount"
                inputMode="decimal"
                placeholder="40.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adj-direction">Direction (adjustment)</Label>
              <select
                id="adj-direction"
                name="direction"
                defaultValue="increase"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                <option value="increase">Increase</option>
                <option value="decrease">Decrease</option>
              </select>
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="adj-label">Description</Label>
              <Input
                id="adj-label"
                name="label"
                placeholder="e.g. ATM withdrawal"
                required
              />
            </div>
            <div className="md:col-span-2">
              <Button
                type="submit"
                disabled={patientAccounts.length === 0}
              >
                Post adjustment
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Patient settings</CardTitle>
          <CardDescription>
            Display name, locale, and font size. The patient sees money and
            dates rendered in their locale; the currency follows the locale
            automatically (en-CA shows Canadian dollars, en-US shows US
            dollars).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={updatePatientSettingsAction}
            className="grid md:grid-cols-2 gap-4 max-w-2xl"
          >
            <input type="hidden" name="patientId" value={patient.id} />
            <div className="space-y-2">
              <Label htmlFor="settings-displayName">Display name</Label>
              <Input
                id="settings-displayName"
                name="displayName"
                defaultValue={patient.displayName}
                required
                maxLength={60}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-fontSize">Font size</Label>
              <select
                id="settings-fontSize"
                name="fontSize"
                defaultValue={settings.font_size}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                <option value="lg">Large</option>
                <option value="xl">Extra large</option>
                <option value="2xl">2× extra large</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-locale">Locale</Label>
              <Input
                id="settings-locale"
                name="locale"
                defaultValue={settings.locale}
                placeholder="en-US"
                pattern="^[a-z]{2}-[A-Z]{2}$"
                required
              />
              <p className="text-xs text-slate-500">
                Format: <code>en-US</code>, <code>fr-FR</code>,{" "}
                <code>en-CA</code>.
              </p>
            </div>
            <div className="md:col-span-2">
              <Button type="submit">Save settings</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
