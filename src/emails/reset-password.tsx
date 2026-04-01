import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface ResetPasswordEmailProps {
  resetUrl: string;
}

export function ResetPasswordEmail({ resetUrl }: ResetPasswordEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Reset your A2A Comms password</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logoText}>A2A</Text>
          </Section>

          <Heading style={heading}>Reset Your Password</Heading>

          <Text style={paragraph}>
            We received a request to reset your password. Click the button below to
            create a new password. If you didn&apos;t request this, you can safely ignore
            this email.
          </Text>

          <Section style={buttonSection}>
            <Button style={button} href={resetUrl}>
              Reset Password
            </Button>
          </Section>

          <Text style={paragraph}>
            This link will expire in 1 hour for security. If it has expired,
            request a new password reset from the login page.
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            If you didn&apos;t request a password reset, no action is needed.
            Your password will remain unchanged.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ResetPasswordEmail;

const main: React.CSSProperties = {
  backgroundColor: '#0B1220',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const container: React.CSSProperties = {
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '560px',
};

const logoSection: React.CSSProperties = {
  textAlign: 'center' as const,
  marginBottom: '32px',
};

const logoText: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: '800',
  color: '#2DD4BF',
  letterSpacing: '0.1em',
  margin: '0',
};

const heading: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: '700',
  color: '#FFFFFF',
  textAlign: 'center' as const,
  margin: '0 0 24px',
};

const paragraph: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#94A3B8',
  margin: '0 0 16px',
};

const buttonSection: React.CSSProperties = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button: React.CSSProperties = {
  backgroundColor: '#2DD4BF',
  borderRadius: '8px',
  color: '#0B1220',
  fontSize: '14px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  padding: '12px 32px',
};

const hr: React.CSSProperties = {
  borderColor: '#1E293B',
  margin: '32px 0',
};

const footer: React.CSSProperties = {
  fontSize: '12px',
  lineHeight: '20px',
  color: '#64748B',
  textAlign: 'center' as const,
};
