import "server-only";

import {
  AdminNotification,
  type AdminNotificationProps,
} from "@/emails/admin-notification";
import { sendEmail } from "@/lib/email";

export type AdminNotificationKind = AdminNotificationProps;

const SUBJECT_PREFIX = "[Clearview Savings ops] ";

// Sends an ops-only notification to ADMIN_EMAIL. Silent no-op if ADMIN_EMAIL
// is unset so local dev without admin configuration doesn't crash and so
// missing-env in any code path can't break user-facing flows.
export async function sendAdminNotification(
  notification: AdminNotificationKind,
): Promise<void> {
  const to = process.env.ADMIN_EMAIL;
  if (!to) return;

  await sendEmail({
    to,
    subject: SUBJECT_PREFIX + subjectFor(notification),
    react: AdminNotification(notification),
  });
}

function subjectFor(n: AdminNotificationKind): string {
  switch (n.kind) {
    case "new-caregiver":
      return `new caregiver — ${n.caregiverEmail}`;
    case "rate-limit-breach":
      return `rate-limit breach on ${n.endpoint} from ${n.ip}`;
    case "fatal-sentry":
      return `fatal Sentry event — ${n.title}`;
    case "daily-digest":
      return `daily digest — ${n.caregiverCount} caregivers, ${n.patientCount} patients`;
    case "email-lockout":
      return `email lockout — ${n.email}`;
    case "mfa-disabled":
      return `MFA disabled — ${n.caregiverEmail}`;
  }
}
