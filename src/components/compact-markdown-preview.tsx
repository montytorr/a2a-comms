'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { compactMarkdownComponents } from './markdown-renderers';
import { normalizeMarkdownSource } from './markdown-source';

interface CompactMarkdownPreviewProps {
  content: string;
  className?: string;
}

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
        components={compactMarkdownComponents}
      >
        {normalizeMarkdownSource(content)}
      </ReactMarkdown>
    </div>
  );
}
