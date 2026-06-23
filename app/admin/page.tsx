import { desc, sql } from "drizzle-orm";
import Link from "next/link";

import { Brandmark } from "@/components/Brandmark";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { auditLog, caregivers, patients } from "@/lib/db/schema";

export const metadata = {
  title: "Admin — Clearview Savings",
  robots: { index: false, follow: false },
};

// Counts must be live, not baked at build time. Without this, Next.js
// detects no dynamic-API access in this server component and prerenders the
// page with counts frozen from build time.
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [recentCaregivers, [totalCaregiverRow], [totalPatientRow]] =
    await Promise.all([
      db
        .select({
          id: caregivers.id,
          email: caregivers.email,
          createdAt: caregivers.createdAt,
        })
        .from(caregivers)
        .orderBy(desc(caregivers.createdAt))
        .limit(10),
      db.select({ count: sql<number>`count(*)::int` }).from(caregivers),
      db.select({ count: sql<number>`count(*)::int` }).from(patients),
    ]);

  const [activeRow] = await db
    .select({
      count: sql<number>`count(distinct ${auditLog.caregiverId})::int`,
    })
    .from(auditLog)
    .where(sql`${auditLog.createdAt} >= now() - interval '7 days'`);

  const dateFmt = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <div className="bg-rose-100 border-b border-rose-300 text-rose-900 text-sm py-2 px-6 text-center">
        You are in admin mode.
      </div>
      <header className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <Link href="/admin" aria-label="Admin dashboard">
            <Brandmark size="md" />
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/caregiver">Caregiver view</Link>
            </Button>
            <form action="/sign-out" method="post">
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">
          <div>
            <h1 className="text-2xl font-semibold">Operations dashboard</h1>
            <p className="text-sm text-slate-600 mt-1">
              Lightweight ops view. Notifications still arrive by email; this
              is the live cross-check.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardDescription>Caregivers total</CardDescription>
                <CardTitle className="text-3xl">
                  {totalCaregiverRow?.count ?? 0}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Patients total</CardDescription>
                <CardTitle className="text-3xl">
                  {totalPatientRow?.count ?? 0}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>
                  Caregivers active in last 7 days
                </CardDescription>
                <CardTitle className="text-3xl">
                  {activeRow?.count ?? 0}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent caregivers</CardTitle>
              <CardDescription>
                The ten most recent caregivers to verify an email and land a
                row.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentCaregivers.length === 0 ? (
                <p className="text-sm text-slate-600">No caregivers yet.</p>
              ) : (
                <ul className="divide-y">
                  {recentCaregivers.map((c) => (
                    <li
                      key={c.id}
                      className="py-2 flex items-center justify-between text-sm"
                    >
                      <span className="font-mono">{c.email}</span>
                      <span className="text-slate-500">
                        {dateFmt.format(c.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rate-limit breaches</CardTitle>
              <CardDescription>
                Recent IPs that exceeded the auth rate-limit threshold.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600">
                Not wired yet — populated by the Upstash rolling window in
                Step 7.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
