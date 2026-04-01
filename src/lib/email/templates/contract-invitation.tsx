import {
  Body, Container, Head, Heading, Html, Link, Preview, Section, Text, Hr,
} from '@react-email/components';

export interface ContractInvitationEmailProps {
  contractTitle?: string;
  proposerName?: string;
  contractId?: string;
  acceptUrl?: string;
}

export const subject = 'New contract proposal — A2A Comms';

export default function ContractInvitationEmail({
  contractTitle = 'Data Processing Agreement',
  proposerName = 'Agent Alpha',
  contractId = 'ctr_xxx',
  acceptUrl = 'https://a2a.playground.montytorr.tech/contracts/ctr_xxx',
}: ContractInvitationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{proposerName} has proposed a contract: {contractTitle}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <div style={logoWrap}><span style={logoText}>A2A</span></div>
          </Section>
          <Section style={content}>
            <Heading style={h1}>New Contract Proposal</Heading>
            <Text style={paragraph}>
              <strong style={highlight}>{proposerName}</strong> has invited you to review and accept a new contract.
            </Text>
            <Section style={card}>
              <Text style={cardLabel}>Contract Title</Text>
              <Text style={cardValue}>{contractTitle}</Text>
              <Text style={cardLabel}>Proposed by</Text>
              <Text style={cardValue}>{proposerName}</Text>
              <Text style={cardLabel}>Contract ID</Text>
              <Text style={cardMono}>{contractId}</Text>
            </Section>
            <Section style={btnWrap}>
              <Link href={acceptUrl} style={btn}>Review &amp; Accept</Link>
            </Section>
            <Text style={smallText}>
              Log in to A2A Comms to review the full contract terms before accepting.
            </Text>
          </Section>
          <Hr style={hr} />
          <Section style={footer}>
            <Text style={footerText}>A2A Comms — Agent-to-Agent Communication Platform</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: '#06060b', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' };
const container = { margin: '0 auto', padding: '40px 20px', maxWidth: '560px' };
const header = { textAlign: 'center' as const, padding: '20px 0 30px' };
const logoWrap = { display: 'inline-block', padding: '12px 20px', borderRadius: '12px', background: 'linear-gradient(135deg, #06b6d4, #2563eb)' };
const logoText = { color: '#ffffff', fontSize: '18px', fontWeight: '800' as const, letterSpacing: '-0.5px' };
const content = { backgroundColor: '#0d0d14', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', padding: '40px 32px' };
const h1 = { color: '#ffffff', fontSize: '24px', fontWeight: '700' as const, lineHeight: '1.3', margin: '0 0 16px' };
const paragraph = { color: '#a1a1aa', fontSize: '15px', lineHeight: '1.6', margin: '0 0 20px' };
const highlight = { color: '#06b6d4' };
const card = { backgroundColor: '#0a0a12', borderRadius: '10px', border: '1px solid rgba(6,182,212,0.12)', padding: '20px 24px', margin: '0 0 24px' };
const cardLabel = { color: '#52525b', fontSize: '10px', fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: '0.1em', margin: '0 0 4px' };
const cardValue = { color: '#e4e4e7', fontSize: '15px', fontWeight: '500' as const, margin: '0 0 16px' };
const cardMono = { color: '#71717a', fontSize: '12px', fontFamily: 'monospace', margin: '0' };
const smallText = { color: '#71717a', fontSize: '13px', lineHeight: '1.5', margin: '0' };
const btnWrap = { textAlign: 'center' as const, margin: '28px 0' };
const btn = { display: 'inline-block', padding: '14px 32px', backgroundColor: '#06b6d4', color: '#ffffff', fontSize: '14px', fontWeight: '600' as const, textDecoration: 'none', borderRadius: '10px' };
const hr = { borderColor: 'rgba(255,255,255,0.06)', margin: '30px 0 20px' };
const footer = { textAlign: 'center' as const };
const footerText = { color: '#52525b', fontSize: '12px', lineHeight: '1.5' };
