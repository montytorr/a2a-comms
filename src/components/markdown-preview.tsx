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
            <h1 className="text-[18px] font-bold text-white mt-4 mb-2 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-[15px] font-semibold text-white mt-4 mb-2 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[13px] font-semibold text-gray-200 mt-3 mb-1.5 first:mt-0">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-[12px] font-semibold text-gray-300 mt-2 mb-1 first:mt-0">{children}</h4>
          ),
          p: ({ children }) => (
            <p className="text-[13px] text-gray-400 leading-relaxed mb-3 last:mb-0">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-none space-y-1 mb-3 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 mb-3 last:mb-0 text-[13px] text-gray-400">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="flex items-start gap-2 text-[13px] text-gray-400">
              <span className="text-gray-600 mt-[3px] shrink-0">•</span>
              <span>{children}</span>
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-gray-200">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-gray-400">{children}</em>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.includes('language-');
            if (isBlock) {
              return (
                <code className="block bg-white/[0.04] border border-white/[0.06] rounded-lg px-4 py-3 text-[12px] font-mono text-cyan-300 overflow-x-auto my-3">
                  {children}
                </code>
              );
            }
            return (
              <code className="bg-white/[0.06] px-1.5 py-0.5 rounded text-[11px] font-mono text-cyan-300">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-4 py-3 text-[12px] font-mono overflow-x-auto my-3">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-cyan-500/40 pl-4 my-3 italic text-gray-500">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table className="w-full text-[12px] border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-white/[0.08]">{children}</thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-white/[0.04] hover:bg-white/[0.02]">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="text-left py-2 px-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="py-2 px-3 text-gray-400">{children}</td>
          ),
          hr: () => <hr className="border-white/[0.06] my-4" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
