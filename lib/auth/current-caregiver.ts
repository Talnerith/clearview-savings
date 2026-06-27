import "server-only";

import { redirect } from "next/navigation";

import { getAalState } from "@/lib/auth/aal";
import { ensureCaregiver } from "@/lib/auth/ensure-caregiver";
import { type Caregiver } from "@/lib/db/schema";
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

  return ensureCaregiver(user);
}
