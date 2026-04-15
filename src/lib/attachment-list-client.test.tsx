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
    uploader_agent_id: null,
    uploader_user_id: null,
    filename: 'sample.md',
    original_name: 'sample.md',
    mime_type: 'text/markdown',
    size_bytes: 128,
    storage_bucket: 'artifacts',
    storage_path: 'attachments/att-1',
    sha256: null,
    metadata: {},
    created_at: '2026-04-15T10:00:00.000Z',
    preview_url: 'https://example.com/sample-preview.md',
    download_url: 'https://example.com/sample.md',
    ...overrides,
  };
}

test('attachment list renders preview action for markdown attachments', () => {
  const html = renderToStaticMarkup(<AttachmentListClient attachments={[makeAttachment()]} />);

  assert.match(html, /Open text/i);
  assert.match(html, /Open preview in new tab/i);
  assert.match(html, /sample-preview\.md/i);
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
          preview_url: 'https://example.com/photo-preview.png',
          download_url: 'https://example.com/photo.png',
        }),
      ]}
    />,
  );

  assert.match(html, /Preview image/i);
  assert.match(html, /Open preview in new tab/i);
  assert.match(html, /photo-preview\.png/i);
  assert.match(html, /img/i);
});

test('attachment preview modal keeps fullscreen actions available', () => {
  const html = renderToStaticMarkup(
    <AttachmentListClient
      attachments={[
        makeAttachment({
          id: 'att-3',
          filename: 'clip.mp4',
          original_name: 'clip.mp4',
          mime_type: 'video/mp4',
          preview_url: 'https://example.com/clip-preview.mp4',
          download_url: 'https://example.com/clip.mp4',
        }),
      ]}
    />,
  );

  assert.match(html, /Open video/i);
  assert.match(html, /Open preview in new tab/i);
});

test('attachment preview modal uses a body portal host and viewport-level overlay classes', async () => {
  const file = await import('node:fs/promises');
  const source = await file.readFile(new URL('../components/attachment-list-client.tsx', import.meta.url), 'utf8');

  assert.match(source, /createPortal\(/);
  assert.match(source, /document\.body/);
  assert.match(source, /data-attachment-preview-portal="true"/);
  assert.match(source, /z-\[2147483647\]/);
  assert.match(source, /h-dvh min-h-screen w-screen max-w-none/);
});

test('attachment list falls back to download url when preview url is unavailable', () => {
  const html = renderToStaticMarkup(
    <AttachmentListClient
      attachments={[
        makeAttachment({
          preview_url: undefined,
          download_url: 'https://example.com/fallback.md',
        }),
      ]}
    />,
  );

  assert.match(html, /Open preview in new tab/i);
  assert.match(html, /fallback\.md/i);
});
