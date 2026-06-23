import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";

import { ResetPassword } from "./reset-password";

describe("ResetPassword", () => {
  it("renders the password-reset email with the reset URL", async () => {
    const html = await render(
      <ResetPassword resetUrl="https://clearviewsavings.com/auth/callback?token_hash=abc123&type=recovery&next=%2Freset-password" />,
    );
    expect(html).toMatchSnapshot();
  });

  it("includes the reset URL in both the CTA and the fallback link", async () => {
    const url = "https://clearviewsavings.com/auth/callback?token_hash=xyz";
    const html = await render(<ResetPassword resetUrl={url} />);
    const occurrences = html.split(url).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("renders the footer disclosure verbatim", async () => {
    const html = await render(
      <ResetPassword resetUrl="https://example.com/reset" />,
    );
    expect(html).toContain("memory-care companion application");
    expect(html).toContain("https://clearviewsavings.com/about");
  });
});
