import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAalState } from "@/lib/auth/aal";
import { safeNextPath } from "@/lib/auth/next-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { recoverWithCodeAction, verifyChallengeAction } from "./actions";

export const metadata = {
  title: "Verify it's you — Clearview Savings",
};

export default async function ChallengePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string; next?: string }>;
}) {
  const { error, mode, next: rawNext } = await searchParams;
  const recovery = mode === "recovery";
  // Where to land after stepping up. /reset-password routes here so a
  // forgotten-password caregiver with MFA can reach AAL2 first.
  const next = safeNextPath(rawNext);
  const recoveryHref =
    next === "/caregiver"
      ? "/challenge?mode=recovery"
      : `/challenge?mode=recovery&next=${encodeURIComponent(next)}`;
  const authenticatorHref =
    next === "/caregiver"
      ? "/challenge"
      : `/challenge?next=${encodeURIComponent(next)}`;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  // Only an AAL1 session with a verified factor belongs here. Already
  // stepped up, or no factor at all → straight on to wherever we were headed.
  const aal = await getAalState(supabase);
  if (aal !== "aal1-needs-aal2") {
    redirect(next);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Verify it&apos;s you</h1>
        <p className="text-sm text-slate-600 mt-1">
          {recovery
            ? "Enter one of the recovery codes you saved when you set up two-factor authentication."
            : "Enter the 6-digit code from your authenticator app to finish signing in."}
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      )}

      {recovery ? (
        <>
          <form action={recoverWithCodeAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Recovery code</Label>
              <Input
                id="code"
                name="code"
                autoComplete="one-time-code"
                placeholder="ABCDE-FGHIJ"
                required
              />
            </div>
            <Button type="submit" className="w-full">
              Use recovery code
            </Button>
          </form>
          <p className="text-sm text-slate-600">
            Have your phone?{" "}
            <Link href={authenticatorHref} className="font-medium underline">
              Use your authenticator app instead
            </Link>
            .
          </p>
        </>
      ) : (
        <>
          <form action={verifyChallengeAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-2">
              <Label htmlFor="code">6-digit code</Label>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                required
              />
            </div>
            <Button type="submit" className="w-full">
              Verify
            </Button>
          </form>
          <p className="text-sm text-slate-600">
            Lost your phone?{" "}
            <Link href={recoveryHref} className="font-medium underline">
              Use a recovery code instead
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
