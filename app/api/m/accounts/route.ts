import { requireApiPatient } from "@/lib/auth/api-caregiver";
import {
  ApiError,
  asApiError,
  jsonError,
  jsonOk,
  preflight,
} from "@/lib/api/respond";
import { db } from "@/lib/db";
import { addAccount, addAccountInput } from "@/lib/accounts/manage";

// POST /api/m/accounts — caregiver adds the patient's savings account.
export const runtime = "nodejs";

export function OPTIONS(req: Request): Response {
  return preflight(req);
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = addAccountInput.safeParse(body);
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

    let account;
    try {
      account = await addAccount(db, {
        ...parsed.data,
        patientId: patient.id,
        caregiverId: caregiver.id,
      });
    } catch (err) {
      throw asApiError(err);
    }

    return jsonOk(req, {
      ok: true,
      account: {
        id: account.id,
        name: account.name,
        type: account.type,
        balance_cents: account.balanceCents,
      },
    });
  } catch (err) {
    return jsonError(req, err);
  }
}
