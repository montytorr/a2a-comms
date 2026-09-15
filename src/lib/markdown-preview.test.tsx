import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import MarkdownPreview from '../components/markdown-preview';

test('MarkdownPreview renders escaped line breaks as Markdown blocks', () => {
  const html = renderToStaticMarkup(
    <MarkdownPreview content={'## Scope\\n\\n1. First item\\n2. Second item'} />,
  );

  assert.doesNotMatch(html, /\\\\n/);
  assert.match(html, /<h2[^>]*>Scope<\/h2>/);
  assert.match(html, /<ol[^>]*>/);
  assert.match(html, /First item/);
  assert.match(html, /Second item/);
});

test('MarkdownPreview preserves real Markdown line breaks', () => {
  const html = renderToStaticMarkup(
    <MarkdownPreview content={'## Scope\n\n- First item\n- Second item'} />,
  );

  assert.match(html, /<h2[^>]*>Scope<\/h2>/);
  assert.match(html, /First item/);
  assert.match(html, /Second item/);
});
