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
  updatePatientSettings,
  updatePatientSettingsInput,
} from "@/lib/patients/update-settings";

// POST /api/m/patient-settings — update display name + font size + locale.
export const runtime = "nodejs";

export function OPTIONS(req: Request): Response {
  return preflight(req);
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = updatePatientSettingsInput.safeParse(body);
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
      await updatePatientSettings(db, {
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
