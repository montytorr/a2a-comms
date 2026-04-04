import {
  Body, Container, Head, Heading, Html, Link, Preview, Section, Text, Hr,
} from '@react-email/components';

export interface TaskAssignedEmailProps {
  taskTitle?: string;
  projectName?: string;
  priority?: string;
  taskUrl?: string;
  summary?: string;
  blockerSummary?: string;
}

export const subject = 'Task assigned to you — A2A Comms';

const priorityColors: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
};
const priorityBg: Record<string, string> = {
  critical: 'rgba(239,68,68,0.08)', high: 'rgba(249,115,22,0.08)', medium: 'rgba(234,179,8,0.08)', low: 'rgba(34,197,94,0.08)',
};

export default function TaskAssignedEmail({
  taskTitle = 'Implement OAuth flow',
  projectName = 'Platform v2',
  priority = 'high',
  taskUrl = 'https://a2a.playground.montytorr.tech/projects/xxx/tasks/yyy',
  summary,
  blockerSummary,
}: TaskAssignedEmailProps) {
  const pColor = priorityColors[priority.toLowerCase()] ?? '#06b6d4';
  const pBg = priorityBg[priority.toLowerCase()] ?? 'rgba(6,182,212,0.08)';

  return (
    <Html>
      <Head />
      <Preview>New task assigned: {taskTitle} [{priority}]</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <div style={logoWrap}><span style={logoText}>A2A</span></div>
          </Section>
          <Section style={content}>
            <Heading style={h1}>Task Assigned</Heading>
            <Text style={paragraph}>{summary || 'A new task has been assigned to you on A2A Comms.'}</Text>
            <Section style={card}>
              <Text style={taskTitleStyle}>{taskTitle}</Text>
              <Text style={{ ...cardLabel, marginTop: '16px' }}>Project</Text>
              <Text style={cardValue}>{projectName}</Text>
              <Text style={cardLabel}>Priority</Text>
              <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '6px', backgroundColor: pBg, color: pColor, fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {priority}
              </span>
              {blockerSummary && (
                <>
                  <Text style={{ ...cardLabel, marginTop: '16px' }}>Blockers</Text>
                  <Text style={cardValue}>{blockerSummary}</Text>
                </>
              )}
            </Section>
            <Section style={btnWrap}>
              <Link href={taskUrl} style={btn}>View Task</Link>
            </Section>
            <Text style={smallText}>
              Update status, add comments, or manage dependencies in A2A Comms.
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
const card = { backgroundColor: '#0a0a12', borderRadius: '10px', border: '1px solid rgba(6,182,212,0.12)', padding: '20px 24px', margin: '0 0 24px' };
const taskTitleStyle = { color: '#f4f4f5', fontSize: '17px', fontWeight: '600' as const, margin: '0', lineHeight: '1.4' };
const cardLabel = { color: '#52525b', fontSize: '10px', fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: '0.1em', margin: '0 0 4px' };
const cardValue = { color: '#a1a1aa', fontSize: '14px', margin: '0 0 12px' };
const smallText = { color: '#71717a', fontSize: '13px', lineHeight: '1.5', margin: '0' };
const btnWrap = { textAlign: 'center' as const, margin: '28px 0' };
const btn = { display: 'inline-block', padding: '14px 32px', backgroundColor: '#06b6d4', color: '#ffffff', fontSize: '14px', fontWeight: '600' as const, textDecoration: 'none', borderRadius: '10px' };
const hr = { borderColor: 'rgba(255,255,255,0.06)', margin: '30px 0 20px' };
const footer = { textAlign: 'center' as const };
const footerText = { color: '#52525b', fontSize: '12px', lineHeight: '1.5' };
