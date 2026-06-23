import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAalState } from "@/lib/auth/aal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { resetPasswordAction } from "./actions";

export const metadata = {
  title: "Set new password — Clearview Savings",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  // Recovery-link callback signs the user in before sending them here. Any
  // visitor without a session arrived by other means; send them home with a
  // calm message rather than a half-functional form.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      "/sign-in?error=Your+reset+link+has+expired.+Please+request+a+new+one.",
    );
  }

  // Supabase refuses updateUser({ password }) from an AAL1 session when the
  // caregiver has MFA enabled. The recovery link only grants AAL1, so a
  // forgotten-password caregiver with MFA must step up to AAL2 here first —
  // requiring their authenticator on top of email access, which strengthens
  // rather than bypasses MFA. After /challenge they return to set the
  // password against an AAL2 session.
  if ((await getAalState(supabase)) === "aal1-needs-aal2") {
    redirect("/challenge?next=/reset-password");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Set a new password</h1>
        <p className="text-sm text-slate-600 mt-1">
          Choose a new password for your account.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      )}

      <form action={resetPasswordAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <p className="text-xs text-slate-500">At least 8 characters.</p>
        </div>
        <Button type="submit" className="w-full">
          Save new password
        </Button>
      </form>
    </div>
  );
}
