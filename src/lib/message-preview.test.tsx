import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import CompactMarkdownPreview from '../components/compact-markdown-preview';
import {
  MAX_MESSAGE_PREVIEW_CHARS,
  extractMessagePreview,
} from './message-preview';

test('extractMessagePreview prefers summary and bounds long markdown input', () => {
  const longSummary = `## Summary\n\n${'x'.repeat(MAX_MESSAGE_PREVIEW_CHARS + 80)}`;

  const preview = extractMessagePreview({
    summary: longSummary,
    text: 'fallback text',
  });

  assert.ok(preview.startsWith('## Summary'));
  assert.ok(preview.endsWith('...'));
  assert.equal(preview.length, MAX_MESSAGE_PREVIEW_CHARS + 3);
});

test('extractMessagePreview falls back to payload message before generic object summaries', () => {
  const preview = extractMessagePreview({
    payload: {
      message: 'Payload **message**',
    },
    other: 'ignored',
  });

  assert.equal(preview, 'Payload **message**');
});

test('extractMessagePreview summarizes non-text objects without stringifying the full payload', () => {
  const preview = extractMessagePreview({
    status: 'ok',
    attempts: 3,
    payload: { nested: true, large: 'x'.repeat(500) },
    tags: ['a', 'b', 'c'],
  });

  assert.match(preview, /status: ok/);
  assert.match(preview, /attempts: 3/);
  assert.ok(preview.length <= MAX_MESSAGE_PREVIEW_CHARS + 3);
});

test('CompactMarkdownPreview renders markdown cues into compact readable markup', () => {
  const html = renderToStaticMarkup(
    <CompactMarkdownPreview content={'## Title\n- [x] done with `code`'} />
  );

  assert.doesNotMatch(html, /## Title/);
  assert.match(html, /Title/);
  assert.match(html, /\[x\]/);
  assert.match(html, /code/);
});
