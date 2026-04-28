'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export default function MarkdownPreview({ content, className = '' }: MarkdownPreviewProps) {
  return (
    <div className={`markdown-preview ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="h2" style={{ marginTop: 16, marginBottom: 8 }}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="h3" style={{ fontSize: 15, marginTop: 16, marginBottom: 8 }}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="h3" style={{ marginTop: 12, marginBottom: 6 }}>{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-1)', marginTop: 8, marginBottom: 4 }}>{children}</h4>
          ),
          p: ({ children }) => (
            <p style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.6, marginBottom: 12 }}>{children}</p>
          ),
          ul: ({ children }) => (
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ listStyleType: 'decimal', listStylePosition: 'inside', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12, fontSize: 13, color: 'var(--fg-2)' }}>{children}</ol>
          ),
          li: ({ children }) => (
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--fg-2)' }}>
              <span style={{ color: 'var(--fg-3)', marginTop: 3, flexShrink: 0 }}>•</span>
              <span>{children}</span>
            </li>
          ),
          strong: ({ children }) => (
            <strong style={{ fontWeight: 600, color: 'var(--fg-1)' }}>{children}</strong>
          ),
          em: ({ children }) => (
            <em style={{ fontStyle: 'italic', color: 'var(--fg-2)' }}>{children}</em>
          ),
          code: ({ children, className: codeClassName }) => {
            const isBlock = codeClassName?.includes('language-');
            if (isBlock) {
              return (
                <code style={{
                  display: 'block',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--line-1)',
                  borderRadius: 6,
                  padding: '12px 16px',
                  fontSize: 12,
                  fontFamily: 'var(--mono)',
                  color: 'var(--amber)',
                  overflowX: 'auto',
                  margin: '12px 0',
                }}>
                  {children}
                </code>
              );
            }
            return (
              <code style={{
                background: 'var(--bg-2)',
                padding: '1px 6px',
                borderRadius: 4,
                fontSize: 11,
                fontFamily: 'var(--mono)',
                color: 'var(--amber)',
              }}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre style={{
              background: 'var(--bg-2)',
              border: '1px solid var(--line-1)',
              borderRadius: 6,
              padding: '12px 16px',
              fontSize: 12,
              fontFamily: 'var(--mono)',
              overflowX: 'auto',
              margin: '12px 0',
            }}>
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote style={{
              borderLeft: '2px solid var(--line-2)',
              paddingLeft: 16,
              margin: '12px 0',
              fontStyle: 'italic',
              color: 'var(--fg-3)',
            }}>
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--amber)', textDecoration: 'underline', textUnderlineOffset: 2 }}
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', margin: '12px 0' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead style={{ borderBottom: '1px solid var(--line-1)' }}>{children}</thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr style={{ borderBottom: '1px solid var(--line-1)' }}>{children}</tr>
          ),
          th: ({ children }) => (
            <th className="upper" style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10 }}>
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td style={{ padding: '8px 12px', color: 'var(--fg-2)' }}>{children}</td>
          ),
          hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--line-1)', margin: '16px 0' }} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
