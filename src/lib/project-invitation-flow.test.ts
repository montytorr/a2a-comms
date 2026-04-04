import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getProjectInvitationExpiry,
  getProjectInvitationReminderThreshold,
  isProjectInvitationExpired,
  isProjectInvitationReminderDue,
  PROJECT_INVITATION_REMINDER_HOURS,
  PROJECT_INVITATION_TTL_DAYS,
} from './project-invitations';
import {
  ACCEPTED_WEBHOOK_EVENTS,
  CANONICAL_WEBHOOK_EVENTS,
  LEGACY_WEBHOOK_EVENT_ALIASES,
  isAcceptedWebhookEvent,
} from './webhook-events';
import {
  getProjectInvitationSweepBatchSize,
  getProjectInvitationSweepIntervalMs,
  getProjectInvitationSweepRunMode,
  getProjectInvitationSweepSummary,
  PROJECT_INVITATION_SWEEP_DEFAULT_BATCH_SIZE,
  PROJECT_INVITATION_SWEEP_DEFAULT_INTERVAL_MS,
} from './project-invitation-worker-config';

function filterAvailableAgents(
  allAgents: Array<{ id: string }>,
  memberIds: string[],
  pendingInviteIds: string[]
) {
  const memberSet = new Set(memberIds);
  const pendingSet = new Set(pendingInviteIds);
  return allAgents.filter((agent) => !memberSet.has(agent.id) && !pendingSet.has(agent.id));
}

function resolveInvitationAction(action: 'accept' | 'decline' | 'cancel') {
  return action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'cancelled';
}

test('available agents exclude existing members and pending invitees', () => {
  const agents = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const available = filterAvailableAgents(agents, ['a'], ['c']);
  assert.deepEqual(available.map((a) => a.id), ['b', 'd']);
});

test('invitation actions map to stable statuses', () => {
  assert.equal(resolveInvitationAction('accept'), 'accepted');
  assert.equal(resolveInvitationAction('decline'), 'declined');
  assert.equal(resolveInvitationAction('cancel'), 'cancelled');
});

test('project invitation constants remain stable for sweep/CLI consumers', () => {
  assert.equal(PROJECT_INVITATION_TTL_DAYS, 7);
  assert.equal(PROJECT_INVITATION_REMINDER_HOURS, 72);
});

test('project invitation expiry defaults to 7 days after creation', () => {
  const createdAt = '2026-04-01T12:00:00.000Z';
  assert.equal(getProjectInvitationExpiry(createdAt), '2026-04-08T12:00:00.000Z');
});

test('project invitation reminder threshold defaults to 72 hours after creation', () => {
  const createdAt = '2026-04-01T12:00:00.000Z';
  assert.equal(getProjectInvitationReminderThreshold(createdAt), '2026-04-04T12:00:00.000Z');
});

test('expired invitations are gated from response', () => {
  assert.equal(
    isProjectInvitationExpired({
      status: 'pending',
      created_at: '2026-03-20T00:00:00.000Z',
      expires_at: '2026-03-27T00:00:00.000Z',
    }),
    true,
  );

  assert.equal(
    isProjectInvitationExpired({
      status: 'accepted',
      created_at: '2026-03-20T00:00:00.000Z',
      expires_at: '2026-03-27T00:00:00.000Z',
    }),
    false,
  );
});

test('reminders do not fire before the threshold', () => {
  assert.equal(
    isProjectInvitationReminderDue(
      {
        status: 'pending',
        created_at: '2026-04-01T00:00:00.000Z',
        reminder_sent_at: null,
        expires_at: '2026-04-08T00:00:00.000Z',
      },
      new Date('2026-04-03T23:59:59.000Z'),
    ),
    false,
  );
});

test('sweep worker config defaults stay stable for ops wiring', () => {
  assert.equal(PROJECT_INVITATION_SWEEP_DEFAULT_INTERVAL_MS, 10 * 60 * 1000);
  assert.equal(PROJECT_INVITATION_SWEEP_DEFAULT_BATCH_SIZE, 100);
  assert.equal(getProjectInvitationSweepIntervalMs({}), 10 * 60 * 1000);
  assert.equal(getProjectInvitationSweepBatchSize({}), 100);
  assert.equal(getProjectInvitationSweepRunMode({}), 'daemon');
  assert.equal(getProjectInvitationSweepSummary({}), 'mode=daemon, interval=10m, batch=100');
});

test('sweep worker config reads env overrides predictably', () => {
  const env = {
    PROJECT_INVITATION_SWEEP_INTERVAL_MS: '300000',
    PROJECT_INVITATION_SWEEP_BATCH_SIZE: '25',
    PROJECT_INVITATION_SWEEP_ONCE: '1',
  };
  assert.equal(getProjectInvitationSweepIntervalMs(env), 300000);
  assert.equal(getProjectInvitationSweepBatchSize(env), 25);
  assert.equal(getProjectInvitationSweepRunMode(env), 'once');
  assert.equal(getProjectInvitationSweepSummary(env), 'mode=once, interval=5m, batch=25');
});

test('canonical webhook event list stays aligned with implemented event producers', () => {
  assert.deepEqual(CANONICAL_WEBHOOK_EVENTS, [
    'invitation',
    'message',
    'contract.accepted',
    'contract.rejected',
    'contract.cancelled',
    'contract.closed',
    'contract.expired',
    'task.created',
    'task.updated',
    'sprint.created',
    'sprint.updated',
    'project.member_added',
    'project.member_invited',
    'project.member_accepted',
    'project.member_declined',
    'project.member_cancelled',
    'project.member_expired',
    'approval.requested',
    'approval.approved',
    'approval.denied',
  ]);

  assert.deepEqual(LEGACY_WEBHOOK_EVENT_ALIASES, ['contract_state']);
  assert.equal(ACCEPTED_WEBHOOK_EVENTS.includes('contract_state'), true);
  assert.equal(isAcceptedWebhookEvent('project.member_invited'), true);
  assert.equal(isAcceptedWebhookEvent('project.member_added'), true);
  assert.equal(isAcceptedWebhookEvent('nope.event'), false);
});

test('reminders send once after the threshold and never for expired invitations', () => {
  assert.equal(
    isProjectInvitationReminderDue(
      {
        status: 'pending',
        created_at: '2026-04-01T00:00:00.000Z',
        reminder_sent_at: null,
        expires_at: '2026-04-08T00:00:00.000Z',
      },
      new Date('2026-04-04T00:01:00.000Z'),
    ),
    true,
  );

  assert.equal(
    isProjectInvitationReminderDue(
      {
        status: 'pending',
        created_at: '2026-04-01T00:00:00.000Z',
        reminder_sent_at: '2026-04-04T00:01:00.000Z',
        expires_at: '2026-04-08T00:00:00.000Z',
      },
      new Date('2026-04-05T00:01:00.000Z'),
    ),
    false,
  );

  assert.equal(
    isProjectInvitationReminderDue(
      {
        status: 'pending',
        created_at: '2026-04-01T00:00:00.000Z',
        reminder_sent_at: null,
        expires_at: '2026-04-03T00:00:00.000Z',
      },
      new Date('2026-04-04T00:01:00.000Z'),
    ),
    false,
  );

  assert.equal(
    isProjectInvitationReminderDue(
      {
        status: 'declined',
        created_at: '2026-04-01T00:00:00.000Z',
        reminder_sent_at: null,
        expires_at: '2026-04-08T00:00:00.000Z',
      },
      new Date('2026-04-04T00:01:00.000Z'),
    ),
    false,
  );
});
