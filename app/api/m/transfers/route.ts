import { requireApiPatient } from "@/lib/auth/api-caregiver";
import { ApiError, jsonError, jsonOk, preflight } from "@/lib/api/respond";
import { db } from "@/lib/db";
import { dollarsToCents } from "@/lib/money";
import { performTransfer, transferInput } from "@/lib/transfers/transfer";

// POST /api/m/transfers — caregiver transfers between two of the patient's
// accounts. Reuses performTransfer (atomic; writes both legs + balances + the
// audit row in one db.transaction). Ownership of the patient is enforced here;
// performTransfer re-checks that both accounts belong to the patient.
export const runtime = "nodejs";

export function OPTIONS(req: Request): Response {
  return preflight(req);
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = transferInput.safeParse(body);
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

    let result;
    try {
      result = await performTransfer(db, {
        caregiverId: caregiver.id,
        patientId: patient.id,
        fromAccountId: parsed.data.fromAccountId,
        toAccountId: parsed.data.toAccountId,
        amountCents: dollarsToCents(parsed.data.amount),
      });
    } catch (err) {
      // performTransfer throws on invariant/ownership violations. Map the
      // ownership/existence ones to 403, the rest to a calm 400.
      const message = err instanceof Error ? err.message : "Transfer failed.";
      if (/belong|not found/.test(message)) {
        throw new ApiError(403, "invalid_account", message);
      }
      throw new ApiError(400, "transfer_failed", message);
    }

    return jsonOk(req, {
      ok: true,
      transferId: result.transferId,
      fromTransactionId: result.fromTransactionId,
      toTransactionId: result.toTransactionId,
    });
  } catch (err) {
    return jsonError(req, err);
  }
}
