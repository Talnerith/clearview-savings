import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type React from "react";

// Full lockup (mark + in-SVG "CLEARVIEW SAVINGS" wordmark). The HTML/favicon
// path uses the cropped icon-only file; the email path uses this lockup so the
// header reads as a finished bank logo without a separate typographic wordmark.
const BRAND_LOGO_URL =
  "https://clearviewsavings.com/branding/clearview-savings-logo.svg";

export const emailStyles = {
  body: {
    backgroundColor: "#f8fafc",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    margin: 0,
    padding: 0,
  },
  container: {
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    margin: "32px auto",
    maxWidth: "560px",
    padding: "32px",
  },
  brandRow: {
    paddingBottom: "24px",
    textAlign: "center" as const,
  },
  brandLogo: {
    display: "block",
    margin: "0 auto",
  },
  heading: {
    color: "#0f172a",
    fontSize: "24px",
    fontWeight: 600,
    lineHeight: "32px",
    margin: "0 0 16px",
  },
  paragraph: {
    color: "#334155",
    fontSize: "16px",
    lineHeight: "24px",
    margin: "0 0 16px",
  },
  button: {
    backgroundColor: "#047857",
    borderRadius: "8px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "16px",
    fontWeight: 600,
    padding: "12px 24px",
    textDecoration: "none",
  },
  buttonRow: {
    padding: "8px 0 24px",
    textAlign: "center" as const,
  },
  fallbackLink: {
    color: "#047857",
    fontSize: "12px",
    lineHeight: "18px",
    margin: "0 0 16px",
    overflowWrap: "anywhere" as const,
    wordBreak: "break-all" as const,
  },
  footer: {
    borderTop: "1px solid #e2e8f0",
    color: "#64748b",
    fontSize: "12px",
    lineHeight: "18px",
    marginTop: "24px",
    paddingTop: "16px",
    textAlign: "center" as const,
  },
  footerLink: {
    color: "#64748b",
    textDecoration: "underline",
  },
};

export function EmailLayout({
  preview,
  children,
}: {
  preview: string;
  children: React.ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={emailStyles.body}>
        <Container style={emailStyles.container}>
          <Section style={emailStyles.brandRow}>
            <Img
              src={BRAND_LOGO_URL}
              width="240"
              height="136"
              alt="Clearview Savings"
              style={emailStyles.brandLogo}
            />
          </Section>
          {children}
          <Section style={emailStyles.footer}>
            <Text style={{ margin: 0 }}>
              Clearview Savings is a memory-care companion application.{" "}
              <Link
                href="https://clearviewsavings.com/about"
                style={emailStyles.footerLink}
              >
                Learn more
              </Link>
              .
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
