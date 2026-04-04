import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCKED_TASK_FOLLOW_THROUGH_HOURS,
  BLOCKED_TASK_STALE_HOURS,
  getBlockedTaskAgeHours,
  getBlockedTaskNotificationState,
  summarizeBlockingTasks,
} from './task-blocker-notifications';

test('blocked task thresholds stay explicit', () => {
  assert.equal(BLOCKED_TASK_FOLLOW_THROUGH_HOURS, 24);
  assert.equal(BLOCKED_TASK_STALE_HOURS, 48);
});

test('summarize blocking tasks prefers human-readable dependency names', () => {
  assert.equal(summarizeBlockingTasks(['Upstream API fix'], 1), 'Upstream API fix');
  assert.equal(summarizeBlockingTasks(['Upstream API fix', 'Schema migration'], 2), 'Upstream API fix +1 more');
  assert.equal(summarizeBlockingTasks([], 3), '3 dependencies');
});

test('blocked task age rounds down to full hours', () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  assert.equal(getBlockedTaskAgeHours('2026-04-04T09:29:59.000Z', now), 2);
});

test('fresh blockers stay in blocked state', () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  const state = getBlockedTaskNotificationState({
    updatedAt: '2026-04-04T02:00:00.000Z',
    blockedByCount: 1,
    blockingTaskTitles: ['Webhook signature fix'],
  }, now);

  assert.equal(state.tone, 'blocked');
  assert.equal(state.stale, false);
  assert.equal(state.followThroughDue, false);
  assert.equal(state.meta, 'Blocked · waiting on Webhook signature fix');
});

test('day-old blockers trigger follow-through reminders before going stale', () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  const state = getBlockedTaskNotificationState({
    updatedAt: '2026-04-03T11:00:00.000Z',
    blockedByCount: 2,
    blockingTaskTitles: ['Webhook signature fix', 'Schema migration'],
  }, now);

  assert.equal(state.tone, 'follow-through');
  assert.equal(state.stale, false);
  assert.equal(state.followThroughDue, true);
  assert.match(state.meta, /Blocked 25h · follow through on Webhook signature fix \+1 more/);
});

test('old blockers flip to stale escalation', () => {
  const now = new Date('2026-04-04T12:00:00.000Z');
  const state = getBlockedTaskNotificationState({
    updatedAt: '2026-04-02T10:00:00.000Z',
    blockedByCount: 1,
    blockingTaskTitles: ['Webhook signature fix'],
  }, now);

  assert.equal(state.tone, 'stale');
  assert.equal(state.stale, true);
  assert.equal(state.followThroughDue, true);
  assert.match(state.meta, /Blocked 50h · stale blocker · waiting on Webhook signature fix/);
});
