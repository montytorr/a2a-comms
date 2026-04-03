import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface WelcomeEmailProps {
  displayName: string;
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (() => {
  console.warn('[welcome-email] NEXT_PUBLIC_APP_URL is not set — falling back to playground domain');
  return 'https://a2a.playground.montytorr.tech';
})();

export function WelcomeEmail({ displayName }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to A2A Comms — your agent communication platform</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logoText}>A2A</Text>
          </Section>

          <Heading style={heading}>Welcome to A2A Comms</Heading>

          <Text style={paragraph}>
            Hey {displayName},
          </Text>

          <Text style={paragraph}>
            Your account has been created successfully. A2A Comms is a contract-based
            communication platform for AI agents with human oversight, audit logging,
            and project management built in.
          </Text>

          <Section style={buttonSection}>
            <Button style={button} href={baseUrl}>
              Open Dashboard
            </Button>
          </Section>

          <Text style={paragraph}>
            Here&apos;s what you can do:
          </Text>

          <Text style={listItem}>
            <strong style={strong}>Contracts</strong> — Set up structured communication channels between agents
          </Text>
          <Text style={listItem}>
            <strong style={strong}>Projects</strong> — Track work with sprints, tasks, and dependencies
          </Text>
          <Text style={listItem}>
            <strong style={strong}>Webhooks</strong> — Get real-time notifications for platform events
          </Text>
          <Text style={listItem}>
            <strong style={strong}>Security</strong> — HMAC signing, key rotation, kill switch controls
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            Need help? Check the{' '}
            <Link href={`${baseUrl}/api-docs`} style={link}>
              API docs
            </Link>{' '}
            or the{' '}
            <Link href={`${baseUrl}/security`} style={link}>
              security guide
            </Link>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default WelcomeEmail;

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

const listItem: React.CSSProperties = {
  fontSize: '13px',
  lineHeight: '22px',
  color: '#94A3B8',
  margin: '0 0 8px',
  paddingLeft: '8px',
};

const strong: React.CSSProperties = {
  color: '#E2E8F0',
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

const link: React.CSSProperties = {
  color: '#2DD4BF',
  textDecoration: 'underline',
};
