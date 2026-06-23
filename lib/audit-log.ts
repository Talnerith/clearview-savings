import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "@/lib/db/schema";
import { auditLog } from "@/lib/db/schema";

// Wide enough to accept both the main db and a transactional tx — every
// existing helper (redeemCode, materializeScheduledDeposits) uses the same
// shape. Keeps logCaregiverAction callable from inside db.transaction().
export type AppDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

export type AuditActionKind =
  (typeof schema.auditActionKindEnum.enumValues)[number];

export type AuditTargetKind =
  (typeof schema.auditTargetKindEnum.enumValues)[number];

export type LogCaregiverActionArgs = {
  caregiverId: string;
  // Null only for caregiver-level actions that don't belong to a single
  // patient. Every M4 retrofit call site passes a non-null value.
  patientId: string | null;
  actionKind: AuditActionKind;
  targetKind: AuditTargetKind;
  // Null only for actions where the primary entity convention falls down —
  // e.g. a multi-row update. Secondary IDs live in the `after` payload.
  targetId: string | null;
  before?: unknown;
  after?: unknown;
  note?: string | null;
};

// Writes one audit_log row. Called from every caregiver-side mutation,
// exactly once, AFTER the underlying mutation has succeeded. If the
// mutation throws, this is never reached — the action did not happen and
// must not appear in the log. The reverse (log row exists for an action
// that didn't happen) is the failure mode we cannot tolerate.
//
// Exception: when the mutation already runs inside db.transaction(), pass
// the transactional `tx` as the first arg so the log write joins the same
// transaction. That gives true mutation-iff-log atomicity for actions
// like transfers where the audit row is part of the feature.
export async function logCaregiverAction(
  db: AppDatabase,
  args: LogCaregiverActionArgs,
): Promise<void> {
  await db.insert(auditLog).values({
    caregiverId: args.caregiverId,
    patientId: args.patientId,
    actionKind: args.actionKind,
    targetKind: args.targetKind,
    targetId: args.targetId,
    // jsonb columns accept any JSON-serializable value. We stringify-roundtrip
    // here so callers can pass Date instances or other non-plain objects
    // without surprises at the driver layer.
    before: args.before === undefined ? null : sanitize(args.before),
    after: args.after === undefined ? null : sanitize(args.after),
    note: args.note ?? null,
  });
}

function sanitize(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}
