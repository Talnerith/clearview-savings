import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { resendConfirmationAction } from "./actions";

export const metadata = {
  title: "Check your email — Clearview Savings",
};

export default async function CheckYourEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; status?: string }>;
}) {
  const { email, status } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="text-sm text-slate-700">
          We sent a confirmation link to{" "}
          {email ? (
            <span className="font-medium text-slate-900">{email}</span>
          ) : (
            "the address you signed up with"
          )}
          . Click the link to finish creating your Clearview Savings caregiver
          account.
        </p>
        <p className="text-sm text-slate-600">
          The email comes from{" "}
          <span className="font-medium">noreply@clearviewsavings.com</span>. If
          you don&rsquo;t see it within a few minutes, check your spam folder.
        </p>
      </div>

      {status && (
        <p className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800">
          {status}
        </p>
      )}

      <form action={resendConfirmationAction} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="email">Resend confirmation to</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={email ?? ""}
            required
          />
        </div>
        <Button type="submit" variant="outline" className="w-full">
          Send a new confirmation email
        </Button>
      </form>

      <div className="space-y-2 text-sm text-slate-600">
        <p>
          Need to use a different email?{" "}
          <Link href="/sign-up" className="font-medium underline">
            Start over
          </Link>
        </p>
        <p>
          Already confirmed?{" "}
          <Link href="/sign-in" className="font-medium underline">
            Sign in
          </Link>
        </p>
        <p>
          Trouble?{" "}
          <a
            href="mailto:support@clearviewsavings.com"
            className="font-medium underline"
          >
            support@clearviewsavings.com
          </a>
        </p>
      </div>
    </div>
  );
}
