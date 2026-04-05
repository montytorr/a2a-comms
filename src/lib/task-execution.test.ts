import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveTaskExecutionSnapshot,
  isTaskExecutionRunStatus,
  isTaskExecutionStatus,
  mapRunStatusToTaskStatus,
} from './task-execution';

test('run status maps cleanly to task execution snapshot status', () => {
  assert.equal(mapRunStatusToTaskStatus('queued'), 'queued');
  assert.equal(mapRunStatusToTaskStatus('starting'), 'running');
  assert.equal(mapRunStatusToTaskStatus('running'), 'running');
  assert.equal(mapRunStatusToTaskStatus('paused'), 'paused');
  assert.equal(mapRunStatusToTaskStatus('handoff-needed'), 'handoff-needed');
  assert.equal(mapRunStatusToTaskStatus('succeeded'), 'succeeded');
  assert.equal(mapRunStatusToTaskStatus('failed'), 'failed');
  assert.equal(mapRunStatusToTaskStatus('cancelled'), 'cancelled');
});

test('deriveTaskExecutionSnapshot defaults to idle with empty checkpoint payload', () => {
  assert.deepEqual(
    deriveTaskExecutionSnapshot({}),
    {
      status: 'idle',
      active_run_id: null,
      execution_started_at: null,
      execution_heartbeat_at: null,
      execution_completed_at: null,
      last_checkpoint_at: null,
      last_checkpoint_summary: null,
      last_checkpoint_payload: {},
    },
  );
});

test('deriveTaskExecutionSnapshot keeps checkpoint metadata for active runs', () => {
  const snapshot = deriveTaskExecutionSnapshot({
    activeRunId: 'run-1',
    status: 'paused',
    startedAt: '2026-04-05T10:00:00.000Z',
    heartbeatAt: '2026-04-05T10:15:00.000Z',
    checkpointAt: '2026-04-05T10:14:00.000Z',
    checkpointSummary: 'Persisted batch 3',
    checkpointPayload: { cursor: 'batch-3', processed: 120 },
  });

  assert.equal(snapshot.status, 'paused');
  assert.equal(snapshot.active_run_id, 'run-1');
  assert.equal(snapshot.last_checkpoint_summary, 'Persisted batch 3');
  assert.deepEqual(snapshot.last_checkpoint_payload, { cursor: 'batch-3', processed: 120 });
});

test('status guards accept only known execution values', () => {
  assert.equal(isTaskExecutionStatus('running'), true);
  assert.equal(isTaskExecutionStatus('banana'), false);
  assert.equal(isTaskExecutionRunStatus('starting'), true);
  assert.equal(isTaskExecutionRunStatus('idle'), false);
});
