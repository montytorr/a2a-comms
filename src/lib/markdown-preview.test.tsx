import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import MarkdownPreview from '../components/markdown-preview';
import { normalizeMarkdownSource } from '../components/markdown-source';

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

test('normalization restores structural breaks but preserves prose and code literals', () => {
  const source = '## Scope\\n\\n- First\\n- Second';
  assert.equal(normalizeMarkdownSource(source), '## Scope\n\n- First\n- Second');

  const prose = 'Keep literal \\n prose, \\r, and \\r\\n values.';
  assert.equal(normalizeMarkdownSource(prose), prose);

  const inline = '`inline \\n code`';
  assert.equal(normalizeMarkdownSource(inline), inline);

  const fenced = '```text\\nliteral \\n code\\n```';
  assert.equal(normalizeMarkdownSource(fenced), fenced);
});
