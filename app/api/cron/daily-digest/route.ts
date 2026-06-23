import { sql } from "drizzle-orm";

import { sendAdminNotification } from "@/lib/admin-email";
import { db } from "@/lib/db";
import { auditLog, caregivers, patients } from "@/lib/db/schema";

// Vercel Cron POSTs at 09:00 UTC (configured in vercel.json). Per Vercel's
// cron convention, every invocation carries
// `Authorization: Bearer ${CRON_SECRET}` — we verify that header to reject
// any unauthenticated triggers.

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [caregiverRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(caregivers);
  const [patientRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(patients);
  const [activeRow] = await db
    .select({ count: sql<number>`count(distinct ${auditLog.caregiverId})::int` })
    .from(auditLog)
    .where(sql`${auditLog.createdAt} >= now() - interval '7 days'`);

  await sendAdminNotification({
    kind: "daily-digest",
    caregiverCount: caregiverRow?.count ?? 0,
    patientCount: patientRow?.count ?? 0,
    activeLast7d: activeRow?.count ?? 0,
  });

  return Response.json({ ok: true });
}
