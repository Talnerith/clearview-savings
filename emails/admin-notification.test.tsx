import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";

import { AdminNotification } from "./admin-notification";

describe("AdminNotification", () => {
  it("renders the new-caregiver kind", async () => {
    const html = await render(
      <AdminNotification
        kind="new-caregiver"
        caregiverEmail="caregiver@example.com"
        caregiverId="11111111-1111-1111-1111-111111111111"
      />,
    );
    expect(html).toMatchSnapshot();
    expect(html).toContain("caregiver@example.com");
    expect(html).toContain("11111111-1111-1111-1111-111111111111");
  });

  it("renders the rate-limit-breach kind", async () => {
    const html = await render(
      <AdminNotification
        kind="rate-limit-breach"
        ip="203.0.113.42"
        endpoint="/sign-up"
        attempts={17}
      />,
    );
    expect(html).toMatchSnapshot();
    expect(html).toContain("203.0.113.42");
    expect(html).toContain("/sign-up");
    expect(html).toContain("17");
  });

  it("renders the fatal-sentry kind", async () => {
    const html = await render(
      <AdminNotification
        kind="fatal-sentry"
        eventId="abc123def456"
        title="Database connection refused"
        url="https://sentry.io/organizations/clearview/issues/9876"
      />,
    );
    expect(html).toMatchSnapshot();
    expect(html).toContain("Database connection refused");
    expect(html).toContain("abc123def456");
  });

  it("renders the daily-digest kind", async () => {
    const html = await render(
      <AdminNotification
        kind="daily-digest"
        caregiverCount={42}
        patientCount={67}
        activeLast7d={31}
      />,
    );
    expect(html).toMatchSnapshot();
    expect(html).toContain("42");
    expect(html).toContain("67");
    expect(html).toContain("31");
  });

  it("renders the email-lockout kind", async () => {
    const html = await render(
      <AdminNotification
        kind="email-lockout"
        email="caregiver@example.com"
        ip="203.0.113.42"
        attemptsInWindow={5}
      />,
    );
    expect(html).toMatchSnapshot();
    expect(html).toContain("caregiver@example.com");
    expect(html).toContain("203.0.113.42");
    expect(html).toContain("5");
    expect(html).toContain("auth-hardening.md");
  });

  it("renders the mfa-disabled kind", async () => {
    const html = await render(
      <AdminNotification
        kind="mfa-disabled"
        caregiverEmail="caregiver@example.com"
        caregiverId="22222222-2222-2222-2222-222222222222"
      />,
    );
    expect(html).toMatchSnapshot();
    expect(html).toContain("caregiver@example.com");
    expect(html).toContain("22222222-2222-2222-2222-222222222222");
    expect(html).toContain("single-factor");
  });

  it("renders the footer disclosure on every kind", async () => {
    const html = await render(
      <AdminNotification
        kind="new-caregiver"
        caregiverEmail="x@y.com"
        caregiverId="00000000-0000-0000-0000-000000000000"
      />,
    );
    expect(html).toContain("memory-care companion application");
  });
});
