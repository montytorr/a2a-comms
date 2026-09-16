import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveContractStats,
  deriveTaskStats,
  countActiveProjects,
  toDaySeries,
  type ContractRow,
  type TaskRow,
} from './analytics-derive';

// Shape taken from a real 90-day window, so the expectations below can be
// checked against SQL directly rather than against a hand-invented fixture.
const contracts: ContractRow[] = [
  { id: 'a', status: 'closed',    created_at: '2026-09-15T08:33:24Z', current_turns: 2 },
  { id: 'b', status: 'cancelled', created_at: '2026-09-15T12:09:57Z', current_turns: 0 },
  { id: 'c', status: 'closed',    created_at: '2026-09-15T13:06:39Z', current_turns: 30 },
  { id: 'd', status: 'closed',    created_at: '2026-09-15T12:10:13Z', current_turns: 3 },
  { id: 'e', status: 'closed',    created_at: '2026-09-15T12:12:56Z', current_turns: 16 },
  { id: 'f', status: 'active',    created_at: '2026-09-16T14:28:48Z', current_turns: 4 },
];

test('deriveContractStats matches the SQL aggregate for a real window', () => {
  const s = deriveContractStats(contracts);

  assert.deepEqual(s.byStatus, { closed: 4, cancelled: 1, active: 1 });
  assert.equal(s.total, 6);
  // select round(avg(current_turns),1) ... where status <> 'proposed' => 9.2
  assert.equal(s.avgTurns, 9.2);
  assert.deepEqual(s.perDay, { '2026-09-15': 5, '2026-09-16': 1 });
});

test('deriveContractStats excludes proposed contracts from avg turns', () => {
  // A proposal has not taken a turn yet. Counting it would make the average
  // report how many proposals are outstanding, not how long exchanges run.
  const withProposal = deriveContractStats([
    ...contracts,
    { id: 'g', status: 'proposed', created_at: '2026-09-16T15:00:00Z', current_turns: 0 },
  ]);

  assert.equal(withProposal.avgTurns, 9.2, 'proposal must not drag the mean down');
  assert.equal(withProposal.total, 7, 'but it still counts toward contracts created');
  assert.equal(withProposal.byStatus.proposed, 1);
});

test('deriveContractStats treats a null current_turns as zero', () => {
  const s = deriveContractStats([
    { id: 'a', status: 'closed', created_at: '2026-09-15T00:00:00Z', current_turns: null },
    { id: 'b', status: 'closed', created_at: '2026-09-15T00:00:00Z', current_turns: 10 },
  ]);
  assert.equal(s.avgTurns, 5);
});

test('deriveContractStats returns zeroes rather than NaN on an empty window', () => {
  const s = deriveContractStats([]);
  assert.equal(s.avgTurns, 0, 'must not be NaN — it is rendered directly');
  assert.equal(s.total, 0);
  assert.deepEqual(s.byStatus, {});
});

test('deriveContractStats buckets days in UTC, matching the day axis', () => {
  // The axis is built from toISOString(), so bucketing must agree with it or
  // late-evening rows land in the wrong column.
  const s = deriveContractStats([
    { id: 'a', status: 'closed', created_at: '2026-09-15T23:59:59Z', current_turns: 1 },
    { id: 'b', status: 'closed', created_at: '2026-09-16T00:00:01Z', current_turns: 1 },
  ]);
  assert.deepEqual(s.perDay, { '2026-09-15': 1, '2026-09-16': 1 });
});

const tasks: TaskRow[] = [
  { id: '1', status: 'done',        project_id: 'p1' },
  { id: '2', status: 'done',        project_id: 'p1' },
  { id: '3', status: 'in-progress', project_id: 'p2' },
  { id: '4', status: 'backlog',     project_id: null },
];

test('deriveTaskStats counts status, done and touched projects in one pass', () => {
  const s = deriveTaskStats(tasks);

  assert.deepEqual(s.byStatus, { done: 2, 'in-progress': 1, backlog: 1 });
  // The donut's done slice must equal the Tasks Done card sitting above it.
  assert.equal(s.doneCount, s.byStatus.done);
  assert.deepEqual([...s.projectIds].sort(), ['p1', 'p2']);
});

test('deriveTaskStats ignores a null project_id', () => {
  const s = deriveTaskStats([{ id: '1', status: 'todo', project_id: null }]);
  assert.equal(s.projectIds.size, 0);
});

test('countActiveProjects counts only projects that are active AND were worked on', () => {
  const active = new Set(['p1', 'p2', 'p3']);
  const touched = new Set(['p2', 'p3', 'p9']);
  // p1 active but idle; p9 touched but not active. Only p2 and p3 qualify.
  assert.equal(countActiveProjects(active, touched), 2);
});

test('countActiveProjects is zero when nothing was touched', () => {
  assert.equal(countActiveProjects(new Set(['p1']), new Set()), 0);
});

test('toDaySeries fills gaps with zero and preserves axis order', () => {
  const labels = ['2026-09-14', '2026-09-15', '2026-09-16'];
  assert.deepEqual(toDaySeries({ '2026-09-15': 5, '2026-09-16': 1 }, labels), [0, 5, 1]);
});

test('toDaySeries drops days outside the axis', () => {
  // A row older than the window must not leak into the first column.
  const labels = ['2026-09-15', '2026-09-16'];
  assert.deepEqual(toDaySeries({ '2026-01-01': 99, '2026-09-16': 1 }, labels), [0, 1]);
});
