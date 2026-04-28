'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface CompactMarkdownPreviewProps {
  content: string;
  className?: string;
}

const inlineHeading: NonNullable<Components['h1']> = ({ children }) => {
  return <strong style={{ fontWeight: 500, color: 'var(--fg-2)' }}>{children} </strong>;
};

export default function CompactMarkdownPreview({
  content,
  className = '',
}: CompactMarkdownPreviewProps) {
  return (
    <div
      className={className}
      style={{
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        wordBreak: 'break-word',
        fontSize: 13,
        color: 'var(--fg-3)',
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: inlineHeading,
          h2: inlineHeading,
          h3: inlineHeading,
          h4: inlineHeading,
          p: ({ children }) => <span>{children} </span>,
          ul: ({ children }) => <span>{children}</span>,
          ol: ({ children }) => <span>{children}</span>,
          li: ({ children }) => <span>{'• '}{children} </span>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 500, color: 'var(--fg-2)' }}>{children}</strong>
          ),
          em: ({ children }) => <em style={{ fontStyle: 'italic', color: 'var(--fg-2)' }}>{children}</em>,
          code: ({ children }) => (
            <code style={{
              borderRadius: 4,
              background: 'var(--bg-2)',
              padding: '1px 4px',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--amber)',
            }}>
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <span style={{
              borderRadius: 4,
              background: 'var(--bg-2)',
              padding: '1px 8px',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--amber)',
            }}>
              {children}
            </span>
          ),
          blockquote: ({ children }) => (
            <span style={{ borderLeft: '2px solid var(--line-2)', paddingLeft: 8, fontStyle: 'italic', color: 'var(--fg-2)' }}>
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
            <strong style={{ fontWeight: 500, color: 'var(--fg-2)' }}>{children}: </strong>
          ),
          td: ({ children }) => <span>{children} </span>,
          input: ({ checked }) => <span>{checked ? '[x] ' : '[ ] '}</span>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
