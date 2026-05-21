import type { CSSProperties, ReactNode } from 'react';
import type { Components } from 'react-markdown';

const baseCodeStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontFeatureSettings: '"ss01", "ss02"',
  border: '1px solid oklch(0.50 0.08 265 / 0.45)',
  background: 'oklch(0.30 0.04 265 / 0.32)',
  color: 'var(--peri)',
};

const inlineCodeStyle: CSSProperties = {
  ...baseCodeStyle,
  display: 'inline',
  padding: '0.12rem 0.36rem',
  borderRadius: 5,
  fontSize: '0.86em',
  lineHeight: 1.45,
  whiteSpace: 'break-spaces',
};

const blockCodeStyle: CSSProperties = {
  ...baseCodeStyle,
  display: 'block',
  padding: '0.95rem 1rem',
  borderRadius: 8,
  fontSize: 12,
  lineHeight: 1.65,
  color: 'var(--fg-1)',
  background: 'linear-gradient(180deg, var(--bg-2), var(--bg-1))',
  overflowX: 'auto',
  whiteSpace: 'pre',
};

function isBlockCode(className?: string, children?: ReactNode) {
  if (className?.includes('language-')) return true;
  if (typeof children === 'string' && children.includes('\n')) return true;
  if (Array.isArray(children) && children.some((child) => typeof child === 'string' && child.includes('\n'))) return true;
  return false;
}

export const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="h2" style={{ marginTop: 18, marginBottom: 8 }}>{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="h3" style={{ fontSize: 15, marginTop: 18, marginBottom: 8 }}>{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="h3" style={{ marginTop: 14, marginBottom: 6 }}>{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 style={{ fontSize: 12, fontWeight: 650, color: 'var(--fg-1)', marginTop: 10, marginBottom: 4 }}>{children}</h4>
  ),
  p: ({ children }) => (
    <p style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.68, marginBottom: 12 }}>{children}</p>
  ),
  ul: ({ children }) => (
    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5, margin: '0 0 12px 0', padding: 0 }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ listStyleType: 'decimal', listStylePosition: 'outside', display: 'flex', flexDirection: 'column', gap: 5, margin: '0 0 12px 1.25rem', padding: 0, fontSize: 13, color: 'var(--fg-2)' }}>{children}</ol>
  ),
  li: ({ children, ...props }) => {
    const ordered = 'ordered' in props && props.ordered;
    if (ordered) {
      return (
        <li style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.6, paddingLeft: 4 }}>
          {children}
        </li>
      );
    }
    return (
      <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.6 }}>
        <span style={{ color: 'var(--amber)', marginTop: 1, flexShrink: 0 }}>•</span>
        <span>{children}</span>
      </li>
    );
  },
  strong: ({ children }) => (
    <strong style={{ fontWeight: 650, color: 'var(--fg-0)' }}>{children}</strong>
  ),
  em: ({ children }) => (
    <em style={{ fontStyle: 'italic', color: 'var(--fg-1)' }}>{children}</em>
  ),
  code: ({ children, className }) => {
    const isBlock = isBlockCode(className, children);
    return <code className={className} style={isBlock ? blockCodeStyle : inlineCodeStyle}>{children}</code>;
  },
  pre: ({ children }) => (
    <pre style={{ margin: '12px 0', padding: 0, overflowX: 'auto', background: 'transparent' }}>{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote style={{
      borderLeft: '3px solid var(--peri)',
      background: 'var(--peri-bg)',
      borderRadius: '0 8px 8px 0',
      padding: '0.65rem 0.9rem',
      margin: '12px 0',
      color: 'var(--fg-2)',
    }}>
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: 'var(--amber)', textDecoration: 'underline', textDecorationColor: 'oklch(0.80 0.155 65 / 0.55)', textUnderlineOffset: 3 }}
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '12px 0', border: '1px solid var(--line-1)', borderRadius: 8 }}>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead style={{ background: 'var(--bg-2)', borderBottom: '1px solid var(--line-1)' }}>{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr style={{ borderBottom: '1px solid var(--line-1)' }}>{children}</tr>
  ),
  th: ({ children }) => (
    <th className="upper" style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, color: 'var(--fg-2)' }}>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td style={{ padding: '8px 12px', color: 'var(--fg-2)', verticalAlign: 'top' }}>{children}</td>
  ),
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--line-1)', margin: '16px 0' }} />,
  input: ({ checked }) => (
    <span style={{ color: checked ? 'var(--mint)' : 'var(--fg-3)', fontFamily: 'var(--mono)', marginRight: 6 }}>
      {checked ? '[x]' : '[ ]'}
    </span>
  ),
};

const inlineHeading: NonNullable<Components['h1']> = ({ children }) => {
  return <strong style={{ fontWeight: 600, color: 'var(--fg-1)' }}>{children} </strong>;
};

export const compactMarkdownComponents: Components = {
  h1: inlineHeading,
  h2: inlineHeading,
  h3: inlineHeading,
  h4: inlineHeading,
  p: ({ children }) => <span>{children} </span>,
  ul: ({ children }) => <span>{children}</span>,
  ol: ({ children }) => <span>{children}</span>,
  li: ({ children }) => <span style={{ color: 'var(--fg-2)' }}>{'• '}{children} </span>,
  strong: ({ children }) => (
    <strong style={{ fontWeight: 600, color: 'var(--fg-1)' }}>{children}</strong>
  ),
  em: ({ children }) => <em style={{ fontStyle: 'italic', color: 'var(--fg-1)' }}>{children}</em>,
  code: ({ children }) => <code style={inlineCodeStyle}>{children}</code>,
  pre: ({ children }) => <span style={inlineCodeStyle}>{children}</span>,
  blockquote: ({ children }) => (
    <span style={{ borderLeft: '2px solid var(--peri)', paddingLeft: 8, color: 'var(--fg-1)' }}>
      {children}{' '}
    </span>
  ),
  a: ({ children }) => (
    <span style={{ color: 'var(--amber)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
      {children}
    </span>
  ),
  hr: () => <span style={{ color: 'var(--fg-4)' }}> / </span>,
  br: () => <span>{' '}</span>,
  table: ({ children }) => <span>{children}</span>,
  thead: ({ children }) => <span>{children}</span>,
  tbody: ({ children }) => <span>{children}</span>,
  tr: ({ children }) => <span>{children} </span>,
  th: ({ children }) => (
    <strong style={{ fontWeight: 600, color: 'var(--fg-1)' }}>{children}: </strong>
  ),
  td: ({ children }) => <span>{children} </span>,
  input: ({ checked }) => <span style={{ color: checked ? 'var(--mint)' : 'var(--fg-3)' }}>{checked ? '[x] ' : '[ ] '}</span>,
};
