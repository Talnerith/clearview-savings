"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  confirmTotpEnrollment,
  disableMfaAction,
  regenerateRecoveryCodesAction,
  startTotpEnrollment,
} from "./actions";

type Props = {
  enabled: boolean;
  unusedCodeCount: number;
};

// View states for the Security section.
//  - "summary": current on/off state + actions
//  - "enrolling": QR + secret shown, collecting the 6-digit code
//  - "codes": one-time recovery-code display (shown once, never again)
type Enrolling = { factorId: string; qrCode: string; secret: string };

export function MfaSecuritySection({ enabled, unusedCodeCount }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [disableCode, setDisableCode] = useState("");

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const result = await startTotpEnrollment();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEnrolling({
        factorId: result.factorId,
        qrCode: result.qrCode,
        secret: result.secret,
      });
    });
  }

  function handleConfirm() {
    if (!enrolling) return;
    setError(null);
    startTransition(async () => {
      const result = await confirmTotpEnrollment(enrolling.factorId, code);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEnrolling(null);
      setCode("");
      setRecoveryCodes(result.recoveryCodes);
    });
  }

  function handleRegenerate() {
    if (
      !window.confirm(
        "Generate a new set of recovery codes? Your current codes will stop working immediately.",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await regenerateRecoveryCodesAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRecoveryCodes(result.recoveryCodes);
    });
  }

  function handleConfirmDisable() {
    setError(null);
    startTransition(async () => {
      const result = await disableMfaAction(disableCode);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDisabling(false);
      setDisableCode("");
      router.refresh();
    });
  }

  function handleDoneWithCodes() {
    setRecoveryCodes(null);
    router.refresh();
  }

  if (recoveryCodes) {
    return (
      <RecoveryCodesPanel codes={recoveryCodes} onDone={handleDoneWithCodes} />
    );
  }

  if (enrolling) {
    return (
      <div className="space-y-4">
        {error && <InlineError message={error} />}
        <p className="text-sm text-slate-700">
          Scan this QR code with an authenticator app (such as Google
          Authenticator, 1Password, or Authy), then enter the 6-digit code it
          shows.
        </p>
        {/* Supabase returns the QR as an inline SVG data URI; next/image
            blocks SVG sources by default, so render it directly. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={enrolling.qrCode}
          alt="QR code for two-factor setup"
          width={200}
          height={200}
          className="border rounded bg-white p-2"
        />
        <div className="text-sm text-slate-600">
          Can&apos;t scan? Enter this key manually:
          <br />
          <code className="text-xs break-all">{enrolling.secret}</code>
        </div>
        <div className="space-y-2 max-w-xs">
          <Label htmlFor="totp-code">6-digit code</Label>
          <Input
            id="totp-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleConfirm} disabled={pending || code.length !== 6}>
            {pending ? "Verifying…" : "Verify and turn on"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setEnrolling(null);
              setCode("");
              setError(null);
            }}
            disabled={pending}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (disabling) {
    return (
      <div className="space-y-4">
        {error && <InlineError message={error} />}
        <p className="text-sm text-slate-700">
          To turn off two-factor authentication, confirm it&apos;s you: enter a
          current 6-digit code from your authenticator app, or one of your
          recovery codes.
        </p>
        <div className="space-y-2 max-w-xs">
          <Label htmlFor="disable-code">Code</Label>
          <Input
            id="disable-code"
            autoComplete="one-time-code"
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
            placeholder="123456 or ABCDE-FGHIJ"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            onClick={handleConfirmDisable}
            disabled={pending || disableCode.trim().length === 0}
          >
            {pending ? "Turning off…" : "Turn off two-factor authentication"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setDisabling(false);
              setDisableCode("");
              setError(null);
            }}
            disabled={pending}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <InlineError message={error} />}
      {enabled ? (
        <>
          <p className="text-sm text-slate-700">
            Two-factor authentication is{" "}
            <span className="font-medium text-emerald-700">on</span>. You have{" "}
            {unusedCodeCount} recovery{" "}
            {unusedCodeCount === 1 ? "code" : "codes"} remaining.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleRegenerate}
              disabled={pending}
            >
              {pending ? "Working…" : "Regenerate recovery codes"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setError(null);
                setDisabling(true);
              }}
              disabled={pending}
            >
              Disable
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-700">
            Two-factor authentication is{" "}
            <span className="font-medium text-slate-700">off</span>. Add a
            second step at sign-in using an authenticator app, so your password
            alone can&apos;t be used to reach the people you care for.
          </p>
          <Button onClick={handleStart} disabled={pending}>
            {pending ? "Starting…" : "Turn on two-factor authentication"}
          </Button>
        </>
      )}
    </div>
  );
}

function RecoveryCodesPanel({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <strong>Save these recovery codes now.</strong> They will not be shown
        again. Each code works once, to sign in if you lose your authenticator
        device. Keep them somewhere safe.
      </div>
      <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((c) => (
          <li key={c} className="rounded border bg-white px-3 py-2">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => window.print()}>
          Print
        </Button>
        <Button onClick={onDone}>I&apos;ve saved my codes</Button>
      </div>
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
      {message}
    </p>
  );
}
