import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

/**
 * A stale licence claim is a false legal statement, not a typo.
 *
 * This project was MIT through v1.0.337 and is fair-code from v1.0.338. The
 * word "MIT" was in eight places when that changed — a badge, two README
 * lines, the reactor's own README, and three strings rendered on a live
 * marketing page. Miss one and the repository tells a visitor it grants
 * rights it does not grant.
 *
 * The same shape as the guard in release-hygiene.test.ts that keeps a dropped
 * dependency's name out of the code: a rename is a one-off, a habit is not,
 * and the next person to write "MIT licensed" in a doc has no way of knowing
 * it stopped being true.
 *
 * (That guard caught this file the first time, for naming the dependency in
 * this very comment. Two greps over the same tree will do that — and it is
 * the right outcome: both of them are meant to be unforgiving.)
 */

const tracked = () =>
  execFileSync('git', ['ls-files'], { encoding: 'utf8', cwd: root }).trim().split('\n').filter(Boolean);

/** Files that are ALLOWED to say MIT, each for a stated reason. */
const EXEMPT = new Set([
  // The MIT text itself, kept verbatim because the grant it made is permanent.
  'LICENSE-MIT',
  // Explains which licence applies to which versions; it has to name both.
  'LICENSE.md',
  // The historical record. Rewriting it to match today's licence would be the
  // dishonest option, not the tidy one.
  'CHANGELOG.md',
  // Says the old versions stay MIT, which is the point.
  'README.md',
  // Explains why the inbound-licence clause exists.
  'CONTRIBUTING.md',
  // This file, which cannot test for a word without containing it.
  'src/lib/licence-claims.test.ts',
]);

test('nothing claims an MIT licence except the files that explain the history', () => {
  const offenders: string[] = [];
  for (const path of tracked()) {
    if (EXEMPT.has(path)) continue;
    if (!/\.(ts|tsx|js|mjs|json|md|sh|yml|yaml|sql|py)$/.test(path)) continue;
    let text: string;
    try { text = readFileSync(join(root, path), 'utf8'); } catch { continue; }
    // \bMIT\b, but not MIT as part of a longer word (SUBMIT, TRANSMIT…).
    for (const [i, line] of text.split('\n').entries()) {
      if (/(^|[^A-Za-z])MIT([^A-Za-z]|$)/.test(line)) {
        offenders.push(`${path}:${i + 1}  ${line.trim().slice(0, 90)}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `this project is fair-code from v1.0.338. These still claim MIT:\n${offenders.join('\n')}`,
  );
});

test('both licence files exist, and the boundary between them is stated', () => {
  const licence = readFileSync(join(root, 'LICENSE.md'), 'utf8');
  readFileSync(join(root, 'LICENSE-MIT'), 'utf8'); // throws if the MIT grant was deleted

  assert.match(licence, /Sustainable Use License/, 'LICENSE.md names the licence it grants');
  assert.match(licence, /v1\.0\.337/, 'and the last MIT version, so a reader knows where the line is');
  assert.match(licence, /LICENSE-MIT/, 'and points at the preserved MIT text');
  assert.ok(!/n8n/.test(licence.split('## Sustainable Use License')[1] ?? ''),
    'the operative terms must not still refer to n8n');
});
