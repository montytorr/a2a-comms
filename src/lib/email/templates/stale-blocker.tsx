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

export const subject = 'A2A stale blocker escalation';

interface StaleBlockerEmailProps {
  taskTitle?: string;
  projectName?: string;
  blockerSummary?: string;
  escalationReason?: string;
  actedBy?: string;
  taskUrl?: string;
}

const main = { backgroundColor: '#0a0a0f', fontFamily: 'Inter, Arial, sans-serif', margin: 0, padding: '32px 0' };
const container = { maxWidth: '560px', margin: '0 auto', padding: '0 20px' };
const card = { backgroundColor: '#11111b', border: '1px solid rgba(239,68,68,0.28)', borderRadius: '20px', overflow: 'hidden' };
const header = { padding: '24px 28px 12px', textAlign: 'left' as const };
const badge = { display: 'inline-block', borderRadius: '999px', padding: '6px 12px', backgroundColor: 'rgba(239,68,68,0.14)', color: '#fca5a5', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const };
const heading = { color: '#ffffff', fontSize: '24px', lineHeight: '32px', fontWeight: 700, margin: '16px 0 0' };
const content = { padding: '0 28px 28px' };
const paragraph = { color: '#d1d5db', fontSize: '14px', lineHeight: '22px', margin: '0 0 16px' };
const strong = { color: '#ffffff', fontWeight: 700 };
const infoCard = { backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '16px 18px', marginBottom: '16px' };
const label = { color: '#9ca3af', fontSize: '11px', lineHeight: '16px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, margin: '0 0 6px' };
const value = { color: '#f3f4f6', fontSize: '14px', lineHeight: '22px', margin: 0 };
const buttonWrap = { paddingTop: '8px', paddingBottom: '8px' };
const button = { backgroundColor: '#ef4444', borderRadius: '12px', color: '#ffffff', fontSize: '14px', fontWeight: 700, textDecoration: 'none', padding: '12px 18px', display: 'inline-block' };
const divider = { borderColor: 'rgba(255,255,255,0.08)', margin: '24px 0' };
const footer = { color: '#6b7280', fontSize: '12px', lineHeight: '18px', margin: 0 };

export default function StaleBlockerEmail({
  taskTitle = 'Untitled task',
  projectName = 'Unknown project',
  blockerSummary = 'No blockers listed',
  escalationReason = 'The task has been blocked long enough to require operator attention.',
  actedBy = 'A2A operator',
  taskUrl = 'https://a2a.playground.montytorr.tech/projects',
}: StaleBlockerEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Stale blocker escalation for {taskTitle}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Section style={header}>
              <Text style={badge}>Stale blocker</Text>
              <Heading style={heading}>A blocked task needs escalation</Heading>
            </Section>

            <Section style={content}>
              <Text style={paragraph}>
                <span style={strong}>{actedBy}</span> escalated a stale blocker on <span style={strong}>{taskTitle}</span>.
                The blocker has crossed the follow-through window and now needs explicit attention.
              </Text>

              <Section style={infoCard}>
                <Text style={label}>Project</Text>
                <Text style={value}>{projectName}</Text>
              </Section>

              <Section style={infoCard}>
                <Text style={label}>Blocked by</Text>
                <Text style={value}>{blockerSummary}</Text>
              </Section>

              <Section style={infoCard}>
                <Text style={label}>Why you are receiving this</Text>
                <Text style={value}>{escalationReason}</Text>
              </Section>

              <Section style={buttonWrap}>
                <Button href={taskUrl} style={button}>Open blocked task</Button>
              </Section>

              <Hr style={divider} />
              <Text style={footer}>
                This is a dedicated stale-blocker escalation notification, separate from ordinary task assignment mail.
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
