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
      // text-sm is the default rather than inheriting, which after the inline
      // fontSize was removed would have picked up the 16px body size.
      className={`text-sm ${className}`}
      style={{
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        wordBreak: 'break-word',
        color: 'var(--fg-2)',
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
