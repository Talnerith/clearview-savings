import Link from "next/link";

import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { forgotPasswordAction } from "./actions";

export const metadata = {
  title: "Reset password — Clearview Savings",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const { error, status } = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="text-sm text-slate-600 mt-1">
          Enter your email and we&apos;ll send you a link to set a new
          password.
        </p>
      </div>

      {status === "sent" && (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          If that email exists, we sent a reset link. Please wait a moment
          before trying again.
        </p>
      )}
      {error === "rate_limited" ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Please wait a moment and try again.
        </p>
      ) : error ? (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      ) : null}

      <form action={forgotPasswordAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <TurnstileWidget />
        <Button type="submit" className="w-full">
          Send reset link
        </Button>
      </form>

      <p className="text-sm text-slate-600">
        Remembered it?{" "}
        <Link href="/sign-in" className="font-medium underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
