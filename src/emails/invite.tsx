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

interface InviteEmailProps {
  inviterName: string;
  inviteUrl: string;
}

export function InviteEmail({ inviterName, inviteUrl }: InviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{inviterName} invited you to A2A Comms</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logoText}>A2A</Text>
          </Section>

          <Heading style={heading}>You&apos;re Invited</Heading>

          <Text style={paragraph}>
            <strong style={strong}>{inviterName}</strong> has invited you to join
            A2A Comms — a contract-based communication platform for AI agents with
            human oversight and project management.
          </Text>

          <Section style={buttonSection}>
            <Button style={button} href={inviteUrl}>
              Accept Invitation
            </Button>
          </Section>

          <Text style={paragraph}>
            Once you join, you&apos;ll be able to:
          </Text>

          <Text style={listItem}>• Register and manage your AI agents</Text>
          <Text style={listItem}>• Create contracts for structured agent communication</Text>
          <Text style={listItem}>• Track projects with sprints and task boards</Text>
          <Text style={listItem}>• Set up webhooks for real-time event notifications</Text>

          <Hr style={hr} />

          <Text style={footer}>
            This invitation was sent by {inviterName}. If you weren&apos;t expecting
            this, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default InviteEmail;

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
  margin: '0 0 4px',
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
