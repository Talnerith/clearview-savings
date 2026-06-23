"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { redeemCodeAction } from "./actions";
import { CODE_LENGTH, chunkCode, normalizeCode } from "./code-entry";

const STEPS = ["photo", "amount", "code"] as const;
type Step = (typeof STEPS)[number];

const ERROR_MESSAGE = "We couldn't read that code. Please try again.";

function StepNumber({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current) + 1;
  return (
    // slate-700, not slate-600 — slate-600 on the slate-50 page background
    // is ~6.9:1, just under the AAA 7:1 floor.
    <div className="text-lg uppercase tracking-wide text-slate-700">
      Step {idx} of {STEPS.length}
    </div>
  );
}

// One shared treatment for every primary button: pointer cursor, darker
// hover, visibly darker + slightly compressed press, and a spinner while a
// submit is in flight — so the patient always sees that the click "took"
// (M9 visual review).
const PRIMARY_BUTTON_CLASS =
  "w-full cursor-pointer rounded-xl bg-emerald-700 px-6 py-5 text-2xl font-semibold text-white shadow-sm transition hover:bg-emerald-800 active:scale-[0.98] active:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60";

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-6 w-6 animate-spin rounded-full border-[3px] border-white/40 border-t-white align-middle"
    />
  );
}

function ContinueButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={PRIMARY_BUTTON_CLASS}>
      {pending ? (
        <span className="inline-flex items-center justify-center gap-3">
          <Spinner />
          Working…
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export default function DepositWizard({
  patientId,
}: {
  patientId: string;
}) {
  const searchParams = useSearchParams();
  const hasError = searchParams.get("error") === "invalid_or_used";

  const [step, setStep] = useState<Step>(hasError ? "code" : "photo");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (step === "code") {
      codeInputRef.current?.focus();
    }
  }, [step]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setPhotoUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoUrl(typeof reader.result === "string" ? reader.result : null);
    };
    reader.readAsDataURL(file);
    // Clear the input so the underlying File reference isn't retained by the
    // DOM element either. We never put the File into React state.
    e.target.value = "";
  }

  return (
    <div className="space-y-8">
      <StepNumber current={step} />

      {step === "photo" && (
        <section className="space-y-6">
          <h1 className="text-3xl font-semibold">Deposit a Check</h1>
          <p className="text-xl text-slate-700">
            Take a clear photo of the front of your check.
          </p>

          <label
            htmlFor="check-photo"
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-xl text-slate-700 transition hover:bg-slate-100 active:bg-slate-200"
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt="Check preview"
                className="max-h-64 w-auto rounded-md border border-slate-200"
              />
            ) : (
              // Desktop wording (ADR 0005) — a PC has a file picker, not a
              // tap-to-shoot camera.
              <span className="text-2xl">Click to add a photo</span>
            )}
            <input
              id="check-photo"
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="sr-only"
            />
          </label>

          <button
            type="button"
            onClick={() => setStep("amount")}
            className={PRIMARY_BUTTON_CLASS}
          >
            Continue
          </button>

          <Link
            href={`/patient/${patientId}`}
            className="block text-center text-lg text-slate-700 underline-offset-4 hover:underline"
          >
            Cancel
          </Link>
        </section>
      )}

      {step === "amount" && (
        <section className="space-y-6">
          <h1 className="text-3xl font-semibold">Enter the amount</h1>
          <p className="text-xl text-slate-700">
            Type the amount written on the check.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStep("code");
            }}
            className="space-y-6"
          >
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-3xl text-slate-500">
                $
              </span>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-300 bg-white py-5 pl-12 pr-5 text-3xl tabular-nums shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <button type="submit" className={PRIMARY_BUTTON_CLASS}>
              Continue
            </button>
          </form>

          <button
            type="button"
            onClick={() => setStep("photo")}
            className="block w-full cursor-pointer text-center text-lg text-slate-700 underline-offset-4 hover:underline active:text-slate-900"
          >
            Back
          </button>
        </section>
      )}

      {step === "code" && (
        <section className="space-y-6">
          <h1 className="text-3xl font-semibold">Enter the deposit code</h1>
          <p className="text-xl text-slate-700">
            The code is printed at the bottom of the check.
          </p>

          {hasError && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-lg text-amber-900">
              {ERROR_MESSAGE}
            </p>
          )}

          <form action={redeemCodeAction} className="space-y-6">
            <input type="hidden" name="patientId" value={patientId} />
            <input
              ref={codeInputRef}
              type="text"
              name="code"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              maxLength={CODE_LENGTH + 1}
              value={chunkCode(code)}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              placeholder="ABCD 2345"
              className="w-full rounded-xl border border-slate-300 bg-white px-5 py-5 text-center text-4xl font-mono tracking-[0.3em] uppercase shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            <ContinueButton>Deposit</ContinueButton>
          </form>

          <button
            type="button"
            onClick={() => setStep("amount")}
            className="block w-full cursor-pointer text-center text-lg text-slate-700 underline-offset-4 hover:underline active:text-slate-900"
          >
            Back
          </button>
        </section>
      )}
    </div>
  );
}
