import { requireApiPatient } from "@/lib/auth/api-caregiver";
import {
  ApiError,
  asApiError,
  jsonError,
  jsonOk,
  preflight,
} from "@/lib/api/respond";
import { db } from "@/lib/db";
import {
  deleteScheduledDeposit,
  deleteScheduledDepositInput,
} from "@/lib/scheduled-deposits/manage";

// POST /api/m/scheduled-deposits/delete — delete a scheduled deposit (its
// already-materialized transactions are kept; FK is set null on delete).
export const runtime = "nodejs";

export function OPTIONS(req: Request): Response {
  return preflight(req);
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = deleteScheduledDepositInput.safeParse(body);
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

    try {
      await deleteScheduledDeposit(db, {
        ...parsed.data,
        patientId: patient.id,
        caregiverId: caregiver.id,
      });
    } catch (err) {
      throw asApiError(err);
    }

    return jsonOk(req, { ok: true });
  } catch (err) {
    return jsonError(req, err);
  }
}
