import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildHandoffContractDescription, buildHandoffContractTitle } from './handoff-contracts';

test('tasks route accepts assignee_agent_id alias used by the CLI', () => {
  const routeSource = fs.readFileSync(new URL('../app/api/v1/projects/[id]/tasks/route.ts', import.meta.url), 'utf8');
  assert.match(routeSource, /url\.searchParams\.get\('assignee'\) \|\| url\.searchParams\.get\('assignee_agent_id'\)/);
});

test('generated handoff description includes execution context needed for takeover', () => {
  const description = buildHandoffContractDescription({
    task: {
      id: 'task-99',
      title: 'Take over rollout QA',
      description: 'Latest operator notes for QA takeover.',
      status: 'in-progress',
      priority: 'high',
      labels: ['qa', 'handoff'],
      due_date: '2026-04-10',
      execution_status: 'handoff-needed',
      execution_started_at: '2026-04-07T10:00:00.000Z',
      execution_heartbeat_at: '2026-04-07T10:12:00.000Z',
      execution_completed_at: null,
      last_checkpoint_at: '2026-04-07T10:11:00.000Z',
      last_checkpoint_summary: 'Browser smoke complete; API replay pending',
      last_checkpoint_payload: { apiReplay: 'pending' },
      active_run_id: 'run-9',
    },
    run: {
      id: 'run-9',
      status: 'handoff-needed',
      attempt: 1,
      summary: 'Need another operator to continue',
      error_message: null,
      heartbeat_at: '2026-04-07T10:12:00.000Z',
      started_at: '2026-04-07T10:00:00.000Z',
      completed_at: null,
      metadata: { source: 'smoke' },
    },
    checkpoints: [
      {
        id: 'cp-9',
        sequence: 4,
        checkpoint_key: 'api-replay',
        summary: 'Replay still pending',
        payload: { pending: true },
        created_at: '2026-04-07T10:11:00.000Z',
        attachment_ids: ['att-9'],
      },
    ],
    attachments: [
      {
        id: 'att-9',
        original_name: 'qa-notes.md',
        filename: 'qa-notes.md',
        mime_type: 'text/markdown',
        size_bytes: 2048,
        created_at: '2026-04-07T10:10:00.000Z',
      },
    ],
    priorHandoffs: [],
  });

  assert.equal(buildHandoffContractTitle('Take over rollout QA'), 'Handoff · Take over rollout QA');
  assert.match(description, /Task ID: `task-99`/);
  assert.match(description, /Execution status: `handoff-needed`/);
  assert.match(description, /Latest checkpoint summary: \*\*Browser smoke complete; API replay pending\*\*/);
  assert.match(description, /qa-notes\.md/);
  assert.match(description, /Accept this contract only if you are taking ownership/);
});
