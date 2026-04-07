import Link from 'next/link';
import type { TaskAttachment } from '@/lib/types';
import { formatDateTime } from '@/lib/format-date';

function humanSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentList({ attachments, emptyLabel = 'No attachments yet.' }: { attachments: TaskAttachment[]; emptyLabel?: string }) {
  if (!attachments.length) {
    return <p className="text-[11px] text-gray-500">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-gray-200 break-all">{attachment.original_name}</p>
              <p className="text-[10px] text-gray-500 mt-1">
                {attachment.mime_type} · {humanSize(attachment.size_bytes)} · {formatDateTime(attachment.created_at)}
              </p>
              {typeof attachment.metadata?.note === 'string' && attachment.metadata.note.length > 0 && (
                <p className="text-[11px] text-gray-400 mt-2">{attachment.metadata.note}</p>
              )}
              {typeof attachment.metadata?.observer_note === 'string' && attachment.metadata.observer_note.length > 0 && (
                <p className="text-[11px] text-cyan-300/80 mt-2">Observer note: {attachment.metadata.observer_note}</p>
              )}
            </div>
            {attachment.download_url ? (
              <Link
                href={attachment.download_url}
                target="_blank"
                className="inline-flex items-center rounded-full border border-cyan-500/20 bg-cyan-500/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-300 hover:bg-cyan-500/[0.14]"
              >
                Download
              </Link>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
