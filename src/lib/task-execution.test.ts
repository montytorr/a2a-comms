import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveTaskExecutionSnapshot,
  isTaskExecutionRunStatus,
  isTaskExecutionStatus,
  mapRunStatusToTaskStatus,
} from './task-execution';
import { buildHandoffContractDescription, buildHandoffContractTitle, isLikelyHandoffContract } from './handoff-contracts';
import { getLinkedTaskForContract } from './handoff-resume';
import { getDelegationProvenance, isDelegatedExecutionRun } from './delegated-execution';
import type { CreateTaskRequest, UpdateTaskRequest } from './types';

function isMissingAttachmentIdsColumn(error: { message?: string } | null | undefined) {
  return !!error && /attachment_ids/i.test(error.message || '');
}

test('run status maps cleanly to task execution snapshot status', () => {
  assert.equal(mapRunStatusToTaskStatus('queued'), 'queued');
  assert.equal(mapRunStatusToTaskStatus('starting'), 'running');
  assert.equal(mapRunStatusToTaskStatus('running'), 'running');
  assert.equal(mapRunStatusToTaskStatus('pending-approval'), 'pending-approval');
  assert.equal(mapRunStatusToTaskStatus('waiting'), 'waiting');
  assert.equal(mapRunStatusToTaskStatus('blocked'), 'blocked');
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
      execution_status: 'idle',
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

  assert.equal(snapshot.execution_status, 'paused');
  assert.equal(snapshot.active_run_id, 'run-1');
  assert.equal(snapshot.last_checkpoint_summary, 'Persisted batch 3');
  assert.deepEqual(snapshot.last_checkpoint_payload, { cursor: 'batch-3', processed: 120 });
});

test('status guards accept only known execution values', () => {
  assert.equal(isTaskExecutionStatus('running'), true);
  assert.equal(isTaskExecutionStatus('banana'), false);
  assert.equal(isTaskExecutionRunStatus('starting'), true);
  assert.equal(isTaskExecutionRunStatus('pending-approval'), true);
  assert.equal(isTaskExecutionRunStatus('waiting'), true);
  assert.equal(isTaskExecutionRunStatus('blocked'), true);
  assert.equal(isTaskExecutionRunStatus('idle'), false);
});

test('missing attachment_ids detection catches pre-migration schema errors', () => {
  assert.equal(isMissingAttachmentIdsColumn({ message: 'column task_execution_checkpoints.attachment_ids does not exist' }), true);
  assert.equal(isMissingAttachmentIdsColumn({ message: 'duplicate key value violates unique constraint' }), false);
  assert.equal(isMissingAttachmentIdsColumn(null), false);
});

test('handoff contract helpers build deterministic handoff surfaces', () => {
  assert.equal(buildHandoffContractTitle('Rollout QA'), 'Handoff · Rollout QA');

  const description = buildHandoffContractDescription({
    task: {
      id: 'task-1',
      title: 'Rollout QA',
      description: 'Validate the rollout before release.',
      status: 'in-progress',
      priority: 'high',
      labels: ['qa', 'release'],
      due_date: '2026-04-09',
      execution_status: 'handoff-needed',
      execution_started_at: '2026-04-07T10:00:00.000Z',
      execution_heartbeat_at: '2026-04-07T10:10:00.000Z',
      execution_completed_at: null,
      last_checkpoint_at: '2026-04-07T10:09:00.000Z',
      last_checkpoint_summary: 'Browser smoke done; API replay still pending',
      last_checkpoint_payload: { browser: 'done', apiReplay: 'pending' },
      active_run_id: 'run-1',
    },
    run: {
      id: 'run-1',
      status: 'handoff-needed',
      attempt: 2,
      summary: 'Waiting for takeover',
      error_message: null,
      heartbeat_at: '2026-04-07T10:10:00.000Z',
      started_at: '2026-04-07T10:00:00.000Z',
      completed_at: null,
      metadata: { env: 'staging' },
    },
    checkpoints: [
      {
        id: 'cp-1',
        sequence: 3,
        checkpoint_key: 'qa-pass',
        summary: 'Smoke test mostly complete',
        payload: { remaining: ['api replay'] },
        created_at: '2026-04-07T10:09:00.000Z',
        attachment_ids: ['att-1'],
      },
    ],
    attachments: [
      {
        id: 'att-1',
        original_name: 'qa-notes.md',
        filename: 'qa-notes.md',
        mime_type: 'text/markdown',
        size_bytes: 1200,
        created_at: '2026-04-07T10:08:00.000Z',
      },
    ],
    priorHandoffs: [
      {
        contractId: 'contract-1',
        title: 'Handoff · Earlier QA',
        status: 'closed',
        linkedTaskId: 'task-1',
        linkedTaskTitle: 'Rollout QA',
      },
    ],
  });

  assert.match(description, /## Task handoff/);
  assert.match(description, /Latest checkpoint summary: \*\*Browser smoke done; API replay still pending\*\*/);
  assert.match(description, /qa-notes\.md/);
  assert.match(description, /Prior handoff contracts/);
  assert.equal(isLikelyHandoffContract({ title: 'Handoff · Rollout QA', description }), true);
  assert.equal(isLikelyHandoffContract({ title: 'Weekly sync', description: 'Nothing to see here' }), false);
});

test('getLinkedTaskForContract is exported for accept-route handoff claims', () => {
  assert.equal(typeof getLinkedTaskForContract, 'function');
});

test('delegated execution provenance is extracted from run metadata', () => {
  const provenance = getDelegationProvenance({
    delegated_by_agent_id: 'agent-alpha',
    delegated_by_run_id: 'run-1',
    delegated_by_checkpoint_id: 'cp-1',
    delegated_by_checkpoint_key: 'snapshot',
    delegated_by_summary: 'Resume from API replay',
    delegated_at: '2026-04-07T18:00:00.000Z',
    delegation_contract_id: 'contract-1',
    claim_type: 'delegated-execution',
  });

  assert.deepEqual(provenance, {
    delegatedByAgentId: 'agent-alpha',
    delegatedByRunId: 'run-1',
    delegatedByCheckpointId: 'cp-1',
    delegatedByCheckpointKey: 'snapshot',
    delegatedBySummary: 'Resume from API replay',
    delegatedAt: '2026-04-07T18:00:00.000Z',
    delegatedFromAssigneeAgentId: null,
    delegatedFromTaskStatus: null,
    delegatedFromExecutionStatus: null,
    delegationReason: null,
    delegationContractId: 'contract-1',
    claimType: 'delegated-execution',
  });

  assert.equal(isDelegatedExecutionRun({ metadata: { delegated_by_agent_id: 'agent-alpha' } as Record<string, unknown> }), true);
  assert.equal(isDelegatedExecutionRun({ metadata: {} as Record<string, unknown> }), false);
});

test('task request types accept handoff contract payloads', () => {
  const createPayload: CreateTaskRequest = {
    title: 'Take over rollout QA',
    handoff_contract: {
      invitees: ['clawclaw'],
      max_turns: 20,
      expires_in_hours: 72,
      title: 'Handoff · Rollout QA',
    },
  };

  const updatePayload: UpdateTaskRequest = {
    handoff_contract: {
      invitees: ['clawclaw'],
      description: 'Use the latest checkpoint and continue from there.',
    },
  };

  assert.deepEqual(createPayload.handoff_contract?.invitees, ['clawclaw']);
  assert.equal(updatePayload.handoff_contract?.description, 'Use the latest checkpoint and continue from there.');
});
