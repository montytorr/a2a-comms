import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';

/**
 * Every relative link in the docs points at something that exists.
 *
 * Moving four sections out of a 930-line README into docs/ left
 * reactor/README.md pointing at `../README.md#operator-reactor-pattern`, an
 * anchor that no longer existed. Nothing caught it — the doc set has a
 * pre-push hook enforcing that copies stay in SYNC, but nothing checking that
 * its links resolve.
 */

const root = process.cwd();

/** GitHub's heading → anchor slug. */
function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')   // punctuation, including the backticks in `code` headings
    .replace(/\s+/g, '-');
}

function anchorsOf(file: string): Set<string> {
  const anchors = new Set<string>();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^#{1,6}\s+(.*)$/);
    if (m) anchors.add(slug(m[1]!.replace(/`/g, '')));
  }
  return anchors;
}

test('every relative link in the markdown resolves', () => {
  const files = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8', cwd: root })
    .trim().split('\n').filter(Boolean)
    // Generated, enormous, and nobody navigates it by hand.
    .filter((f) => !f.endsWith('CHANGELOG.md'));

  const broken: string[] = [];

  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    // [label](target) where target is relative — skip http(s), mailto and bare anchors.
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = m[1]!;
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      // `[Links](url)` in AGENTS.md is prose ABOUT markdown, not a link. A
      // target with no slash, no dot and no anchor cannot be a real path.
      if (!/[./#]/.test(target)) continue;

      const [path, anchor] = target.split('#');
      const resolved = resolve(dirname(join(root, file)), path || file);
      if (!existsSync(resolved)) {
        broken.push(`${file} → ${target} (no such file)`);
        continue;
      }
      if (anchor && resolved.endsWith('.md') && !anchorsOf(resolved).has(anchor)) {
        broken.push(`${file} → ${target} (no such heading in ${relative(root, resolved)})`);
      }
    }
  }

  assert.deepEqual(broken, [], `broken documentation links:\n  ${broken.join('\n  ')}`);
});
