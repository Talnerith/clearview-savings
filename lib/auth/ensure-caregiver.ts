import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { User } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";

import { sendAdminNotification } from "@/lib/admin-email";
import { db } from "@/lib/db";
import { caregivers, type Caregiver } from "@/lib/db/schema";

// Resolves the app-level caregiver row for an authenticated Supabase user,
// creating it on first sign-in. Shared by both entry points so the
// create-on-first-sign-in behavior (and its one-shot ops notification) lives in
// exactly one place: the cookie/session path (getCurrentCaregiver, web) and the
// bearer-token path (requireApiCaregiver, mobile).
export async function ensureCaregiver(user: User): Promise<Caregiver> {
  const existing = await db
    .select()
    .from(caregivers)
    .where(eq(caregivers.userId, user.id))
    .limit(1);

  const found = existing[0];
  if (found) return found;

  const inserted = await db
    .insert(caregivers)
    .values({ userId: user.id, email: user.email ?? "" })
    .returning();

  const created = inserted[0];
  if (!created) {
    throw new Error("Failed to create caregiver row");
  }

  // Ops notification: one-shot per caregiver. Failure must not block the
  // user's first sign-in — caught and reported to Sentry so we still see it.
  try {
    await sendAdminNotification({
      kind: "new-caregiver",
      caregiverEmail: created.email,
      caregiverId: created.id,
    });
  } catch (err) {
    Sentry.captureException(err);
  }

  return created;
}
