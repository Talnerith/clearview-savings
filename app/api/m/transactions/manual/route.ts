import { requireApiPatient } from "@/lib/auth/api-caregiver";
import { ApiError, jsonError, jsonOk, preflight } from "@/lib/api/respond";
import { db } from "@/lib/db";
import {
  applyManualAdjustment,
  manualAdjustmentInput,
} from "@/lib/transactions/manual-adjustment";

// POST /api/m/transactions/manual — caregiver posts a manual transaction
// (deposit / withdrawal / fee / adjustment). Same shared logic as the web
// Server Action; ownership of both patient and account enforced server-side.
export const runtime = "nodejs";

export function OPTIONS(req: Request): Response {
  return preflight(req);
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = manualAdjustmentInput.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        "invalid_input",
        parsed.error.issues[0]?.message ?? "Invalid input.",
      );
    }

    const { caregiver, patient } = await requireApiPatient(
      req,
      parsed.data.patientId,
    );

    let inserted;
    try {
      inserted = await applyManualAdjustment(db, {
        ...parsed.data,
        patientId: patient.id,
        caregiverId: caregiver.id,
      });
    } catch (err) {
      // The only expected throw is the account-ownership guard inside the
      // helper; surface it as a clean 403 rather than a generic 500.
      if (err instanceof Error && /belong/.test(err.message)) {
        throw new ApiError(403, "invalid_account", err.message);
      }
      throw err;
    }

    return jsonOk(req, {
      ok: true,
      transactionId: inserted.id,
      accountId: inserted.accountId,
      amountCents: inserted.amountCents,
      label: inserted.label,
    });
  } catch (err) {
    return jsonError(req, err);
  }
}
