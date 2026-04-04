import assert from 'node:assert/strict';
import test from 'node:test';

import { staleBlockerNeedsEscalation } from './task-blocker-actions';

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
});

