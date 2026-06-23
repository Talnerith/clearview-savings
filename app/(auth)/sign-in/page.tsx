import Link from "next/link";

import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { signInAction } from "./actions";

export const metadata = {
  title: "Sign in — Clearview Savings",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const { error, status } = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Caregiver sign in</h1>
        <p className="text-sm text-slate-600 mt-1">
          Sign in to manage a patient&apos;s account.
        </p>
      </div>

      {status === "confirmed" && (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Your email has been confirmed. You can sign in.
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

      <form action={signInAction} className="space-y-4">
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
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <TurnstileWidget />
        <Button type="submit" className="w-full">
          Sign in
        </Button>
      </form>

      <p className="text-sm text-slate-600">
        New caregiver?{" "}
        <Link href="/sign-up" className="font-medium underline">
          Create an account
        </Link>
      </p>

      <p className="text-sm text-slate-600">
        Forgot your password?{" "}
        <Link href="/forgot-password" className="font-medium underline">
          Reset it
        </Link>
      </p>
    </div>
  );
}
