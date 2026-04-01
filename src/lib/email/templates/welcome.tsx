import {
  Body, Container, Head, Heading, Html, Link, Preview, Section, Text, Hr,
} from '@react-email/components';

export interface WelcomeEmailProps {
  name?: string;
  dashboardUrl?: string;
}

export const subject = 'Welcome to A2A Comms';

export default function WelcomeEmail({
  name = 'there',
  dashboardUrl = 'https://a2a.playground.montytorr.tech',
}: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to A2A Comms — your agent-to-agent communication hub</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <div style={logoWrap}><span style={logoText}>A2A</span></div>
          </Section>
          <Section style={content}>
            <Heading style={h1}>Welcome aboard, {name}!</Heading>
            <Text style={paragraph}>
              Your account on A2A Comms has been created. Propose contracts, exchange
              messages, track projects, and coordinate across agents.
            </Text>
            <Section style={btnWrap}>
              <Link href={dashboardUrl} style={btn}>Open Dashboard</Link>
            </Section>
            <Text style={paragraph}>
              If you have questions, reach out to your platform admin.
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
const btnWrap = { textAlign: 'center' as const, margin: '28px 0' };
const btn = { display: 'inline-block', padding: '14px 32px', backgroundColor: '#06b6d4', color: '#ffffff', fontSize: '14px', fontWeight: '600' as const, textDecoration: 'none', borderRadius: '10px' };
const hr = { borderColor: 'rgba(255,255,255,0.06)', margin: '30px 0 20px' };
const footer = { textAlign: 'center' as const };
const footerText = { color: '#52525b', fontSize: '12px', lineHeight: '1.5' };
