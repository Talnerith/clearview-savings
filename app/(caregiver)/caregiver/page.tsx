import { asc, eq } from "drizzle-orm";
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
import { getCurrentCaregiver } from "@/lib/auth/current-caregiver";
import { db } from "@/lib/db";
import { patients } from "@/lib/db/schema";

import { addPatientAction } from "./actions";

export const metadata = {
  title: "Caregiver — Clearview Savings",
};

export default async function CaregiverDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string; reenroll?: string }>;
}) {
  const { error, status, reenroll } = await searchParams;
  const caregiver = await getCurrentCaregiver();

  const ownedPatients = await db
    .select({
      id: patients.id,
      displayName: patients.displayName,
      createdAt: patients.createdAt,
    })
    .from(patients)
    .where(eq(patients.caregiverId, caregiver.id))
    .orderBy(asc(patients.createdAt));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Caregiver dashboard</h1>
        <p className="text-sm text-slate-600 mt-1">
          Signed in as {caregiver.email}.
        </p>
      </div>

      {reenroll === "1" && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          You signed in with a recovery code, so two-factor authentication has
          been turned off.{" "}
          <Link href="/caregiver/settings" className="font-medium underline">
            Set it up again
          </Link>{" "}
          to keep your account protected.
        </p>
      )}
      {status === "added" && (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Patient added.
        </p>
      )}
      {status === "patient_deleted" && (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Patient deleted.
        </p>
      )}
      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your patients</CardTitle>
          <CardDescription>
            People whose accounts you manage on Clearview Savings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ownedPatients.length === 0 ? (
            <p className="text-sm text-slate-600">
              No patients yet. Add one below to get started.
            </p>
          ) : (
            <ul className="divide-y">
              {ownedPatients.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/caregiver/patients/${p.id}`}
                    className="flex items-center justify-between py-3 -mx-2 px-2 rounded hover:bg-slate-50"
                  >
                    <span className="text-sm font-medium">{p.displayName}</span>
                    <span className="text-xs text-slate-500">
                      Added {p.createdAt.toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add a patient</CardTitle>
          <CardDescription>
            Use the name they&apos;ll see at the top of their accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={addPatientAction} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="displayName">Patient name</Label>
              <Input
                id="displayName"
                name="displayName"
                placeholder="e.g. Margaret Smith"
                autoComplete="off"
                required
              />
            </div>
            <Button type="submit">Add patient</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
