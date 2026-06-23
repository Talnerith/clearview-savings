import { Button, Link, Section, Text } from "@react-email/components";

import { EmailLayout, emailStyles } from "./layout";

export interface ConfirmEmailProps {
  confirmUrl: string;
}

export function ConfirmEmail({ confirmUrl }: ConfirmEmailProps) {
  return (
    <EmailLayout preview="Confirm your email at Clearview Savings">
      <Section>
        <Text style={emailStyles.heading}>Confirm your email</Text>
        <Text style={emailStyles.paragraph}>
          Thanks for signing up for Clearview Savings. Tap the button below to
          confirm this email address and finish setting up your account.
        </Text>
      </Section>
      <Section style={emailStyles.buttonRow}>
        <Button href={confirmUrl} style={emailStyles.button}>
          Confirm my email
        </Button>
      </Section>
      <Section>
        <Text style={emailStyles.paragraph}>
          If the button doesn&rsquo;t work, paste this link into your browser:
        </Text>
        <Text style={emailStyles.fallbackLink}>
          <Link href={confirmUrl} style={emailStyles.footerLink}>
            {confirmUrl}
          </Link>
        </Text>
        <Text style={emailStyles.paragraph}>
          If you didn&rsquo;t create an account, you can safely ignore this
          email.
        </Text>
      </Section>
    </EmailLayout>
  );
}
