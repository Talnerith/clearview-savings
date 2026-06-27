import { requireApiCaregiver } from "@/lib/auth/api-caregiver";
import { ApiError, jsonError, jsonOk, preflight } from "@/lib/api/respond";
import { db } from "@/lib/db";
import { addPatient, addPatientInput } from "@/lib/patients/add-patient";

// POST /api/m/patients — caregiver adds a patient (with an auto Checking
// account). Auth is caregiver-level (creating a patient, not acting on an
// existing one), so we use requireApiCaregiver rather than requireApiPatient.
export const runtime = "nodejs";

export function OPTIONS(req: Request): Response {
  return preflight(req);
}

export async function POST(req: Request): Promise<Response> {
  try {
    const caregiver = await requireApiCaregiver(req);
    const body = await req.json().catch(() => ({}));
    const parsed = addPatientInput.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        "invalid_input",
        parsed.error.issues[0]?.message ?? "Invalid input.",
      );
    }

    const patient = await addPatient(db, {
      caregiverId: caregiver.id,
      displayName: parsed.data.displayName,
    });

    return jsonOk(req, {
      ok: true,
      patient: { id: patient.id, display_name: patient.displayName },
    });
  } catch (err) {
    return jsonError(req, err);
  }
}
