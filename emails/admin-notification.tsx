import { Link, Section, Text } from "@react-email/components";
import type React from "react";

import { EmailLayout, emailStyles } from "./layout";

export type AdminNotificationProps =
  | {
      kind: "new-caregiver";
      caregiverEmail: string;
      caregiverId: string;
    }
  | {
      kind: "rate-limit-breach";
      ip: string;
      endpoint: string;
      attempts: number;
    }
  | {
      kind: "fatal-sentry";
      eventId: string;
      title: string;
      url: string;
    }
  | {
      kind: "daily-digest";
      caregiverCount: number;
      patientCount: number;
      activeLast7d: number;
    }
  | {
      kind: "email-lockout";
      email: string;
      ip: string;
      attemptsInWindow: number;
    }
  | {
      kind: "mfa-disabled";
      caregiverEmail: string;
      caregiverId: string;
    };

export function AdminNotification(props: AdminNotificationProps) {
  return (
    <EmailLayout preview={previewFor(props)}>
      <Section>
        <Text style={emailStyles.heading}>{titleFor(props)}</Text>
        {bodyFor(props)}
      </Section>
    </EmailLayout>
  );
}

function previewFor(p: AdminNotificationProps): string {
  switch (p.kind) {
    case "new-caregiver":
      return `New caregiver verified: ${p.caregiverEmail}`;
    case "rate-limit-breach":
      return `Rate limit breach on ${p.endpoint} from ${p.ip}`;
    case "fatal-sentry":
      return `Fatal Sentry event: ${p.title}`;
    case "daily-digest":
      return `Daily digest: ${p.caregiverCount} caregivers, ${p.patientCount} patients`;
    case "email-lockout":
      return `Sign-in lockout triggered for ${p.email}`;
    case "mfa-disabled":
      return `Two-factor disabled for ${p.caregiverEmail}`;
  }
}

function titleFor(p: AdminNotificationProps): string {
  switch (p.kind) {
    case "new-caregiver":
      return "New caregiver verified";
    case "rate-limit-breach":
      return "Rate-limit threshold breached";
    case "fatal-sentry":
      return "Fatal Sentry event";
    case "daily-digest":
      return "Daily caregiver digest";
    case "email-lockout":
      return "Sign-in lockout triggered";
    case "mfa-disabled":
      return "Two-factor authentication disabled";
  }
}

function bodyFor(p: AdminNotificationProps): React.ReactNode {
  switch (p.kind) {
    case "new-caregiver":
      return (
        <>
          <Text style={emailStyles.paragraph}>
            A new caregiver verified their email address and created an
            account.
          </Text>
          <Text style={emailStyles.paragraph}>
            Email: <strong>{p.caregiverEmail}</strong>
            <br />
            Caregiver ID: <strong>{p.caregiverId}</strong>
          </Text>
        </>
      );
    case "rate-limit-breach":
      return (
        <Text style={emailStyles.paragraph}>
          IP <strong>{p.ip}</strong> exceeded the rate limit on{" "}
          <strong>{p.endpoint}</strong> with <strong>{p.attempts}</strong>{" "}
          attempts in the rolling window. Review recent logs and consider
          blocking via the Vercel firewall if abusive.
        </Text>
      );
    case "fatal-sentry":
      return (
        <Text style={emailStyles.paragraph}>
          A fatal Sentry event was captured: <strong>{p.title}</strong>. View
          it at{" "}
          <Link href={p.url} style={emailStyles.footerLink}>
            {p.url}
          </Link>{" "}
          (event ID <strong>{p.eventId}</strong>).
        </Text>
      );
    case "daily-digest":
      return (
        <>
          <Text style={emailStyles.paragraph}>Yesterday&rsquo;s roll-up:</Text>
          <Text style={emailStyles.paragraph}>
            Caregivers total: <strong>{p.caregiverCount}</strong>
            <br />
            Patients total: <strong>{p.patientCount}</strong>
            <br />
            Caregivers active in the last 7 days:{" "}
            <strong>{p.activeLast7d}</strong>
          </Text>
        </>
      );
    case "email-lockout":
      return (
        <>
          <Text style={emailStyles.paragraph}>
            An email entered the per-email sign-in lockout. Subsequent sign-in
            attempts to this address will be rejected for 15 minutes regardless
            of source IP.
          </Text>
          <Text style={emailStyles.paragraph}>
            Email: <strong>{p.email}</strong>
            <br />
            Most-recent IP: <strong>{p.ip}</strong>
            <br />
            Failed attempts in the 15-minute window:{" "}
            <strong>{p.attemptsInWindow}</strong>
          </Text>
          <Text style={emailStyles.paragraph}>
            If this looks like a legitimate caregiver locked out by an
            attacker, see the runbook in{" "}
            <code>docs/security/auth-hardening.md</code> to clear the lockout
            key manually.
          </Text>
        </>
      );
    case "mfa-disabled":
      return (
        <>
          <Text style={emailStyles.paragraph}>
            A caregiver disabled two-factor authentication and returned their
            account to single-factor (password-only) sign-in.
          </Text>
          <Text style={emailStyles.paragraph}>
            Email: <strong>{p.caregiverEmail}</strong>
            <br />
            Caregiver ID: <strong>{p.caregiverId}</strong>
          </Text>
          <Text style={emailStyles.paragraph}>
            If this was not expected, it may indicate an account compromise —
            review recent sign-in activity for this address.
          </Text>
        </>
      );
  }
}
