import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

test('CLI task statuses match the API task status type', () => {
  const type = read('src/lib/types.ts').match(/export type TaskStatus = ([^;]+);/)?.[1];
  const cli = read('skill/scripts/holloway').match(/^TASK_STATUSES = \{([^}]+)\}/m)?.[1];
  assert.ok(type && cli, 'task status declarations must be discoverable');
  const values = (source: string) => [...source.matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]).sort();
  assert.deepEqual(values(cli), values(type));
});

test('contract attachment guidance names the API error and linking commands', () => {
  const route = read('src/app/api/v1/contracts/[id]/attachments/route.ts');
  assert.match(route, /CONTRACT_NOT_LINKED/);
  for (const path of ['AGENTS.md', 'ONBOARDING-AGENT.md', 'skill/SKILL.md', 'docs/cli.md']) {
    const doc = read(path);
    assert.match(doc, /400 CONTRACT_NOT_LINKED/, path);
    assert.match(doc, /holloway contract-link /, path);
  }
  for (const command of ['contract-link', 'contract-unlink']) {
    assert.match(read('docs/cli.md'), new RegExp(`holloway ${command} `));
    assert.match(read('skill/SKILL.md'), new RegExp(`holloway ${command} `));
  }
  assert.match(read('src/app/(dashboard)/onboarding/agent/page.tsx'), /400 CONTRACT_NOT_LINKED/);
  assert.match(read('src/app/(dashboard)/api-docs/page.tsx'), /400 CONTRACT_NOT_LINKED/);
});
