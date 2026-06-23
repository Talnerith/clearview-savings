import { Button, Link, Section, Text } from "@react-email/components";

import { EmailLayout, emailStyles } from "./layout";

export interface ResetPasswordProps {
  resetUrl: string;
}

export function ResetPassword({ resetUrl }: ResetPasswordProps) {
  return (
    <EmailLayout preview="Reset your Clearview Savings password">
      <Section>
        <Text style={emailStyles.heading}>Reset your password</Text>
        <Text style={emailStyles.paragraph}>
          We received a request to reset the password on your Clearview Savings
          account. Tap the button below to choose a new one.
        </Text>
      </Section>
      <Section style={emailStyles.buttonRow}>
        <Button href={resetUrl} style={emailStyles.button}>
          Reset my password
        </Button>
      </Section>
      <Section>
        <Text style={emailStyles.paragraph}>
          If the button doesn&rsquo;t work, paste this link into your browser:
        </Text>
        <Text style={emailStyles.fallbackLink}>
          <Link href={resetUrl} style={emailStyles.footerLink}>
            {resetUrl}
          </Link>
        </Text>
        <Text style={emailStyles.paragraph}>
          If you didn&rsquo;t request a password reset, you can safely ignore
          this email and your password will stay the same.
        </Text>
      </Section>
    </EmailLayout>
  );
}
