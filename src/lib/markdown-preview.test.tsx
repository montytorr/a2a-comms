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

test('normalization handles real and escaped breaks mixed in one document', () => {
  // A document part-written by a client that escaped its newlines and part by
  // one that did not. Both halves must come out as real structure.
  const mixed = '## Scope\n\n- Real bullet\\n- Escaped bullet\n\n\\n## Escaped heading';
  assert.equal(
    normalizeMarkdownSource(mixed),
    '## Scope\n\n- Real bullet\n- Escaped bullet\n\n\n## Escaped heading'
  );

  // A real break already adjacent to an escaped one must not be doubled up or
  // swallowed.
  assert.equal(normalizeMarkdownSource('a\n\\n- b'), 'a\n\n- b');
});

test('normalization converts structural escaped carriage returns, not just \\n', () => {
  assert.equal(normalizeMarkdownSource('## Scope\\r\\n\\r\\n- First'), '## Scope\n\n- First');
  assert.equal(normalizeMarkdownSource('## Scope\\r\\r- First'), '## Scope\n\n- First');
});
