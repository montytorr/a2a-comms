import type { TaskAttachment } from '@/lib/types';
import AttachmentListClient from '@/components/attachment-list-client';
import { EmptyState } from '@/components/atoms';

export default function AttachmentList({ attachments, emptyLabel = 'No attachments yet.' }: { attachments: TaskAttachment[]; emptyLabel?: string }) {
  if (!attachments.length) {
    return <EmptyState title={emptyLabel} />;
  }

  return <AttachmentListClient attachments={attachments} />;
}

