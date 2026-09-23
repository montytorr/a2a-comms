import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

test('the contracts list skeleton does not wrap the contract detail route', () => {
  // A loading.tsx directly in contracts/ is the fallback for every child, so
  // opening a contract from anywhere else flashed the LIST skeleton first.
  assert.equal(existsSync(join(root, 'src/app/(dashboard)/contracts/loading.tsx')), false);
  assert.ok(existsSync(join(root, 'src/app/(dashboard)/contracts/(list)/loading.tsx')));
  assert.ok(existsSync(join(root, 'src/app/(dashboard)/contracts/[id]/loading.tsx')));
});

test('the navigation bar makes one forward pass instead of looping', () => {
  const css = read('src/app/globals.css');
  const rule = css.slice(css.indexOf('.navigation-progress {'), css.indexOf('@keyframes navigation-progress'));
  assert.match(rule, /animation:[^;]*forwards/);
  assert.doesNotMatch(rule, /infinite/, 'a looping bar reads as the page loading again every cycle');
});

test('the contract page fetches its independent reads together', () => {
  const page = read('src/app/(dashboard)/contracts/[id]/page.tsx');
  const batch = page.slice(page.indexOf('await Promise.all(['));
  assert.ok(page.includes('await Promise.all(['));
  for (const read of ["from('contracts')", "from('messages')", 'getLinkedTask(id)', 'getRelatedContracts(id)', "from('task_attachments')"]) {
    assert.ok(batch.slice(0, 2000).includes(read), `${read} belongs in the parallel batch`);
  }
});
