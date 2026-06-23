import "server-only";

import * as Sentry from "@sentry/nextjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { sendAdminNotification } from "@/lib/admin-email";
import { getAalState } from "@/lib/auth/aal";
import { db } from "@/lib/db";
import { caregivers, type Caregiver } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Returns the caregiver row for the current session, creating it on first
// sign-in if it doesn't exist yet. Redirects to /sign-in if there is no
// authenticated user.
export async function getCurrentCaregiver(): Promise<Caregiver> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  // Defense in depth beside the middleware AAL2 gate: a stolen AAL1 cookie
  // that somehow bypassed middleware still can't load caregiver data
  // through this loader if the caregiver has a verified factor.
  if ((await getAalState(supabase)) === "aal1-needs-aal2") {
    redirect("/challenge");
  }

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
