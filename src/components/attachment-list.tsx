import type { TaskAttachment } from '@/lib/types';
import AttachmentListClient from '@/components/attachment-list-client';

export default function AttachmentList({ attachments, emptyLabel = 'No attachments yet.' }: { attachments: TaskAttachment[]; emptyLabel?: string }) {
  if (!attachments.length) {
    return <p className="text-[11px] text-gray-500">{emptyLabel}</p>;
  }

  return <AttachmentListClient attachments={attachments} />;
}

