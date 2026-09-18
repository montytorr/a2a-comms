import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The api-docs table of contents claims a number of endpoints per section, by
 * hand, in a prop. Three of those numbers were wrong when this was written:
 * `tasks` was short by three (the five attachment endpoints landed without the
 * TOC being touched), `projects` by one, and `contracts` by one — including
 * after a deliberate edit to that very number, because the value it was being
 * corrected from was already stale.
 *
 * A count nobody can check drifts silently and makes the page quietly wrong
 * about itself. This checks it. It lives under src/lib because that is where
 * the test runner looks; what it reads is a page.
 */
const PAGE = join(process.cwd(), 'src/app/(dashboard)/api-docs/page.tsx');

function tocCounts(source: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of source.split('\n')) {
    const anchor = /TocItem href="#([\w-]+)"/.exec(line);
    const count = /count=\{(\d+)\}/.exec(line);
    if (anchor && count) out.set(anchor[1]!, Number(count[1]));
  }
  return out;
}

function endpointCounts(source: string): Map<string, number> {
  const out = new Map<string, number>();
  let section: string | null = null;
  for (const line of source.split('\n')) {
    const opened = /<Section [^>]*id="([\w-]+)"/.exec(line);
    if (opened) {
      section = opened[1]!;
      if (!out.has(section)) out.set(section, 0);
    }
    if (section && line.includes('<Endpoint ')) out.set(section, out.get(section)! + 1);
  }
  return out;
}

test('every TOC count matches the endpoints its section actually documents', () => {
  const source = readFileSync(PAGE, 'utf8');
  const declared = tocCounts(source);
  const actual = endpointCounts(source);

  assert.ok(declared.size >= 10, 'expected the TOC to still carry per-section counts');

  const wrong = [...declared.entries()]
    .filter(([id, count]) => actual.get(id) !== count)
    .map(([id, count]) => `${id}: says ${count}, documents ${actual.get(id) ?? 0}`);

  assert.deepEqual(wrong, [], `api-docs TOC counts are stale —\n  ${wrong.join('\n  ')}`);
});

test('a section that carries a count actually exists on the page', () => {
  const source = readFileSync(PAGE, 'utf8');
  for (const id of tocCounts(source).keys()) {
    assert.ok(
      endpointCounts(source).has(id),
      `TOC links to #${id}, which is not a Section id on the page`
    );
  }
});
