import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";

import { ConfirmEmail } from "./confirm-email";

describe("ConfirmEmail", () => {
  it("renders the confirmation email with the confirm URL", async () => {
    const html = await render(
      <ConfirmEmail confirmUrl="https://clearviewsavings.com/auth/callback?token_hash=abc123&type=signup&next=%2Fcaregiver" />,
    );
    expect(html).toMatchSnapshot();
  });

  it("includes the confirm URL in both the CTA and the fallback link", async () => {
    const url = "https://clearviewsavings.com/auth/callback?token_hash=xyz";
    const html = await render(<ConfirmEmail confirmUrl={url} />);
    const occurrences = html.split(url).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("renders the footer disclosure verbatim", async () => {
    const html = await render(
      <ConfirmEmail confirmUrl="https://example.com/confirm" />,
    );
    expect(html).toContain("memory-care companion application");
    expect(html).toContain("https://clearviewsavings.com/about");
  });
});
