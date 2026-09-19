import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OPEN_STATUSES } from '@/lib/my-tasks';
import type { TaskStatus } from '@/lib/types';

const root = process.cwd();

/**
 * The statuses the database will actually accept, read from the migration.
 *
 * Scoped to the `tasks` table on purpose: this one file declares a
 * `status … CHECK (status IN (…))` for projects, sprints AND tasks, and an
 * unscoped match returns the project list — which is how the first version of
 * this test managed to fail on correct code.
 */
function statusesTheDatabaseAllows(): string[] {
  const sql = readFileSync(join(root, 'migrations/006_projects_tasks.sql'), 'utf8');
  const table = sql.slice(sql.indexOf('CREATE TABLE tasks'));
  assert.ok(table, 'could not find the tasks table');
  const m = table.match(/status\s+TEXT[^,]*?CHECK\s*\(\s*status\s+IN\s*\(([^)]*)\)/i);
  assert.ok(m, 'could not find the tasks.status CHECK constraint');
  return (m[1]!.match(/'([a-z-]+)'/g) ?? []).map((v) => v.replace(/'/g, ''));
}

test('every status the code treats as open is one a task can actually hold', () => {
  // `blocked` was in this list and the CHECK has never permitted it, so the
  // default view filtered on a value no row can have — while `backlog` and
  // `in-review`, which are real, were missing and therefore invisible.
  const allowed = statusesTheDatabaseAllows();
  const impossible = OPEN_STATUSES.filter((s) => !allowed.includes(s));
  assert.deepEqual(impossible, [], `no task can ever have: ${impossible.join(', ')}`);
});

test('the TaskStatus union matches the database exactly', () => {
  const types = readFileSync(join(root, 'src/lib/types.ts'), 'utf8');
  const m = types.match(/export type TaskStatus =([^;]+);/);
  assert.ok(m);
  const declared = (m[1]!.match(/'([a-z-]+)'/g) ?? []).map((v) => v.replace(/'/g, ''));
  assert.deepEqual([...declared].sort(), [...statusesTheDatabaseAllows()].sort());
});

test('open means live work: everything except the two terminal states', () => {
  const terminal: TaskStatus[] = ['done', 'cancelled'];
  const expected = statusesTheDatabaseAllows().filter((s) => !terminal.includes(s as TaskStatus));
  assert.deepEqual([...OPEN_STATUSES].sort(), expected.sort());
});

test('the /tasks filter offers exactly the real statuses', () => {
  const src = readFileSync(join(root, 'src/app/(dashboard)/tasks/filters.tsx'), 'utf8');
  const block = src.slice(src.indexOf('const statuses = ['), src.indexOf('];', src.indexOf('const statuses = [')));
  const offered = (block.match(/value: '([a-z-]+)'/g) ?? [])
    .map((v) => v.replace(/value: '|'/g, ''))
    .filter((v) => v !== 'open' && v !== 'all');   // the two meta-filters
  assert.deepEqual(offered.sort(), statusesTheDatabaseAllows().sort());
});
