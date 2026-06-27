import { requireApiPatient } from "@/lib/auth/api-caregiver";
import { ApiError, jsonError, jsonOk, preflight } from "@/lib/api/respond";
import { db } from "@/lib/db";
import { redeemCode, redeemInput } from "@/lib/deposit-codes";

// POST /api/m/deposit/redeem — mobile deposit-code redemption.
//
// Auth: caregiver bearer token. On mobile the patient "Deposit a Check" flow
// runs inside the caregiver's authenticated session, so the caller is always
// the caregiver; we require they own the patient before redeeming. Posts the
// amount carried by the code (never a client-supplied amount).
export const runtime = "nodejs";

export function OPTIONS(req: Request): Response {
  return preflight(req);
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = redeemInput.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        "invalid_input",
        parsed.error.issues[0]?.message ?? "Invalid input.",
      );
    }

    const { patient } = await requireApiPatient(req, parsed.data.patientId);

    const result = await redeemCode(db, {
      patientId: patient.id,
      code: parsed.data.code,
    });
    if (!result.ok) {
      throw new ApiError(
        409,
        "invalid_or_used",
        "That code is invalid or has already been used.",
      );
    }

    return jsonOk(req, {
      ok: true,
      transactionId: result.transactionId,
      accountId: result.accountId,
      amountCents: result.amountCents,
      label: result.label,
    });
  } catch (err) {
    return jsonError(req, err);
  }
}
