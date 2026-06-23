import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentCaregiver } from "@/lib/auth/current-caregiver";
import { db } from "@/lib/db";
import { countUnusedRecoveryCodes } from "@/lib/mfa/recovery-codes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { MfaSecuritySection } from "./MfaSecuritySection";

export const metadata = {
  title: "Settings — Clearview Savings",
};

export default async function CaregiverSettingsPage() {
  const caregiver = await getCurrentCaregiver();
  const supabase = await createSupabaseServerClient();

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const mfaEnabled = (factors?.totp ?? []).some(
    (f) => f.status === "verified",
  );
  const unusedCodeCount = mfaEnabled
    ? await countUnusedRecoveryCodes(db, caregiver.id)
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-slate-600 mt-1">
          Signed in as {caregiver.email}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>
            Two-factor authentication adds a one-time code from an
            authenticator app to your sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MfaSecuritySection
            enabled={mfaEnabled}
            unusedCodeCount={unusedCodeCount}
          />
        </CardContent>
      </Card>
    </div>
  );
}
