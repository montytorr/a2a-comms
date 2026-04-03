'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface CompactMarkdownPreviewProps {
  content: string;
  className?: string;
}

const inlineHeading: NonNullable<Components['h1']> = ({ children }) => {
  return <strong className="font-medium text-white/65">{children} </strong>;
};

export default function CompactMarkdownPreview({
  content,
  className = '',
}: CompactMarkdownPreviewProps) {
  return (
    <div
      className={`line-clamp-3 break-words text-sm text-white/40 group-hover:text-white/50 transition-colors
        [&_p]:inline [&_p]:m-0
        [&_ul]:inline [&_ul]:m-0 [&_ol]:inline [&_ol]:m-0
        [&_li]:inline [&_li]:m-0
        ${className}`}
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
            <strong className="font-medium text-white/65">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-white/50">{children}</em>,
          code: ({ children }) => (
            <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[11px] text-cyan-300">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <span className="rounded bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-cyan-300">
              {children}
            </span>
          ),
          blockquote: ({ children }) => (
            <span className="border-l border-cyan-500/30 pl-2 italic text-white/45">
              {children}{' '}
            </span>
          ),
          a: ({ children }) => (
            <span className="text-cyan-300 underline decoration-cyan-400/40 underline-offset-2">
              {children}
            </span>
          ),
          hr: () => <span className="text-white/20"> / </span>,
          br: () => <span>{' '}</span>,
          table: ({ children }) => <span>{children}</span>,
          thead: ({ children }) => <span>{children}</span>,
          tbody: ({ children }) => <span>{children}</span>,
          tr: ({ children }) => <span>{children} </span>,
          th: ({ children }) => (
            <strong className="font-medium text-white/60">{children}: </strong>
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
