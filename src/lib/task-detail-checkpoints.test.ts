import test from 'node:test';
import assert from 'node:assert/strict';
import type { TaskExecutionCheckpointRow } from './task-execution';

function flattenAndSortExecutionCheckpoints(groups: TaskExecutionCheckpointRow[][]) {
  return groups.flat().sort((a, b) => {
    if (a.created_at === b.created_at) return b.sequence - a.sequence;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

test('flattenAndSortExecutionCheckpoints includes checkpoints from completed runs, not just the active run', () => {
  const checkpoints = flattenAndSortExecutionCheckpoints([
    [
      {
        id: 'cp-1',
        run_id: 'run-1',
        task_id: 'task-1',
        project_id: 'proj-1',
        agent_id: 'agent-1',
        sequence: 1,
        checkpoint_key: 'started',
        status: 'written',
        summary: 'Started work',
        payload: {},
        created_at: '2026-04-06T06:00:00.000Z',
      },
    ],
    [
      {
        id: 'cp-2',
        run_id: 'run-2',
        task_id: 'task-1',
        project_id: 'proj-1',
        agent_id: 'agent-1',
        sequence: 2,
        checkpoint_key: 'blocked',
        status: 'written',
        summary: 'Reached blocked state',
        payload: { reason: 'waiting on input' },
        created_at: '2026-04-06T06:05:00.000Z',
      },
    ],
  ]);

  assert.deepEqual(
    checkpoints.map((checkpoint) => checkpoint.id),
    ['cp-2', 'cp-1'],
  );
});

test('flattenAndSortExecutionCheckpoints breaks same-timestamp ties by higher sequence first', () => {
  const checkpoints = flattenAndSortExecutionCheckpoints([
    [
      {
        id: 'cp-older-seq',
        run_id: 'run-1',
        task_id: 'task-1',
        project_id: 'proj-1',
        agent_id: 'agent-1',
        sequence: 1,
        checkpoint_key: 'one',
        status: 'written',
        summary: null,
        payload: {},
        created_at: '2026-04-06T06:05:00.000Z',
      },
      {
        id: 'cp-newer-seq',
        run_id: 'run-1',
        task_id: 'task-1',
        project_id: 'proj-1',
        agent_id: 'agent-1',
        sequence: 2,
        checkpoint_key: 'two',
        status: 'written',
        summary: null,
        payload: {},
        created_at: '2026-04-06T06:05:00.000Z',
      },
    ],
  ]);

  assert.deepEqual(
    checkpoints.map((checkpoint) => checkpoint.id),
    ['cp-newer-seq', 'cp-older-seq'],
  );
});
