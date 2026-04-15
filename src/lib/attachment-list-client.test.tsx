import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import AttachmentListClient from '@/components/attachment-list-client';
import type { TaskAttachment } from '@/lib/types';

function makeAttachment(overrides: Partial<TaskAttachment> = {}): TaskAttachment {
  return {
    id: 'att-1',
    project_id: 'proj-1',
    task_id: 'task-1',
    contract_id: null,
    run_id: null,
    checkpoint_id: null,
    storage_path: 'attachments/att-1',
    filename: 'sample.md',
    original_name: 'sample.md',
    mime_type: 'text/markdown',
    size_bytes: 128,
    created_by_agent_id: null,
    metadata: null,
    created_at: '2026-04-15T10:00:00.000Z',
    download_url: 'https://example.com/sample.md',
    ...overrides,
  };
}

test('attachment list renders preview action for markdown attachments', () => {
  const html = renderToStaticMarkup(<AttachmentListClient attachments={[makeAttachment()]} />);

  assert.match(html, /Open text/i);
  assert.match(html, /Open in new tab/i);
  assert.match(html, /sample\.md/i);
});

test('attachment list renders image preview affordance for image attachments', () => {
  const html = renderToStaticMarkup(
    <AttachmentListClient
      attachments={[
        makeAttachment({
          id: 'att-2',
          filename: 'photo.png',
          original_name: 'photo.png',
          mime_type: 'image/png',
          download_url: 'https://example.com/photo.png',
        }),
      ]}
    />,
  );

  assert.match(html, /Preview image/i);
  assert.match(html, /img/i);
});
