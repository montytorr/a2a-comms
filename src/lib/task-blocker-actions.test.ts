import assert from 'node:assert/strict';
import test from 'node:test';

import { refreshTaskBlockedState, staleBlockerNeedsEscalation } from './task-blocker-actions';

function buildStaleBlockerPayload(hoursBlocked = 50) {
  return {
    event: 'task.blocker_stale',
    project_id: 'project-123',
    task_id: 'task-456',
    data: {
      title: 'Fix webhook retry health check',
      project_title: 'A2A Comms',
      blocker_titles: ['Webhook signature fix'],
      blocker_summary: 'Webhook signature fix',
      escalated_by: 'Stale blocker sweep',
      escalation_reason: `The task has been blocked for ${hoursBlocked}h and crossed the stale-blocker escalation threshold.`,
      hours_blocked: hoursBlocked,
      blocked_at: '2026-04-02T08:00:00.000Z',
      blocker_follow_up_at: '2026-04-03T10:00:00.000Z',
      blocker_followed_through_at: '2026-04-03T10:00:00.000Z',
      blocker_escalated_at: '2026-04-04T12:00:00.000Z',
      blocker_resolution_action: 'Confirm provider owner and unblock the signing-key rollout',
      blocker_resolution_owner: 'Platform reliability owner',
      blocker_resolution_due_at: '2026-04-04T16:00:00.000Z',
      blocker_resolution_status: 'escalate',
      blocker_plan: 'Confirm provider owner and unblock the signing-key rollout · owner: Platform reliability owner · follow-up: 2026-04-04T16:00:00.000Z',
      task_url: 'https://a2a.playground.montytorr.tech/projects/project-123/tasks/task-456',
    },
    timestamp: '2026-04-04T12:00:00.000Z',
  };
}

test('stale blockers without escalation timestamp need automation', () => {
  assert.equal(staleBlockerNeedsEscalation({
    updatedAt: '2026-04-02T08:00:00.000Z',
    blockedAt: '2026-04-02T08:00:00.000Z',
    blockerFollowUpAt: '2026-04-03T10:00:00.000Z',
    blockerFollowedThroughAt: '2026-04-03T10:00:00.000Z',
    blockerEscalatedAt: null,
    blockerTitles: ['Webhook signature fix'],
  }), true);
});

test('already escalated blockers do not re-trigger automation', () => {
  assert.equal(staleBlockerNeedsEscalation({
    updatedAt: '2026-04-02T08:00:00.000Z',
    blockedAt: '2026-04-02T08:00:00.000Z',
    blockerFollowUpAt: '2026-04-03T10:00:00.000Z',
    blockerFollowedThroughAt: '2026-04-03T10:00:00.000Z',
    blockerEscalatedAt: '2026-04-04T12:00:00.000Z',
    blockerTitles: ['Webhook signature fix'],
  }), false);
});

test('stale blocker webhook payload carries explicit escalation reason for bespoke receivers', () => {
  const payload = buildStaleBlockerPayload(50);
  assert.equal(payload.event, 'task.blocker_stale');
  assert.equal(payload.data.blocker_summary, 'Webhook signature fix');
  assert.match(payload.data.escalation_reason, /blocked for 50h/i);
  assert.match(payload.data.task_url, /\/projects\/project-123\/tasks\/task-456$/);
  assert.equal(payload.data.blocker_resolution_owner, 'Platform reliability owner');
  assert.equal(payload.data.blocker_resolution_status, 'escalate');
  assert.match(payload.data.blocker_plan, /owner: Platform reliability owner/);
});

test('refreshTaskBlockedState only treats blocks dependencies as hard blockers', async () => {
  const calls: Array<{ op: string; args?: unknown[] }> = [];
  const taskUpdates: Array<Record<string, unknown>> = [];
  const supabase = {
    from(table: string) {
      if (table === 'task_dependencies') {
        return {
          select(query: string) {
            calls.push({ op: 'select', args: [query] });
            return {
              eq(column: string, value: string) {
                calls.push({ op: 'eq', args: [column, value] });
                if (column === 'dependency_type') {
                  return Promise.resolve({
                    data: [{ dependency_type: 'blocks', blocking_task: { status: 'in-progress' } }],
                  });
                }
                return this;
              },
            };
          },
        };
      }
      if (table === 'tasks') {
        return {
          update(payload: Record<string, unknown>) {
            taskUpdates.push(payload);
            return {
              eq(column: string, value: string) {
                calls.push({ op: 'task-eq', args: [column, value] });
                if (column === 'id') {
                  return {
                    is(innerColumn: string, innerValue: null) {
                      calls.push({ op: 'task-is', args: [innerColumn, innerValue] });
                      return Promise.resolve({});
                    },
                  };
                }
                return Promise.resolve({});
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  } as unknown as Parameters<typeof refreshTaskBlockedState>[0];

  await refreshTaskBlockedState(supabase, 'task-123');

  assert.deepEqual(calls.slice(0, 3), [
    { op: 'select', args: ['dependency_type, blocking_task:tasks!task_dependencies_blocking_task_id_fkey(status)'] },
    { op: 'eq', args: ['blocked_task_id', 'task-123'] },
    { op: 'eq', args: ['dependency_type', 'blocks'] },
  ]);
  assert.equal(taskUpdates.length, 1);
  assert.ok(taskUpdates[0].blocked_at);
});

