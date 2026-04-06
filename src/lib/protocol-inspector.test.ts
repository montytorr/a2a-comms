import test from 'node:test';
import assert from 'node:assert/strict';
import type { TaskExecutionStatus } from './types';

function deriveOperatorRequeueState(input: {
  status: 'pending' | 'pending_retry' | 'retrying' | 'success' | 'failed';
  attempts: number;
  maxRetries: number | null;
  hasEventPayload: boolean;
}) {
  const exhausted = !!input.maxRetries && input.attempts >= input.maxRetries;
  const canOperatorRequeue = input.hasEventPayload
    && (input.status === 'failed' || input.status === 'pending_retry')
    && !!((input.maxRetries || 0) > input.attempts);

  const requeueReason = !input.hasEventPayload
    ? 'Stored event payload missing'
    : input.status === 'success'
      ? 'Successful deliveries are intentionally not replayable here'
      : input.status === 'pending' || input.status === 'retrying'
        ? 'Delivery is already in flight'
        : exhausted
          ? 'Retry budget exhausted'
          : (input.status === 'failed' || input.status === 'pending_retry')
            ? null
            : 'Only failed or pending-retry deliveries can be requeued';

  return { canOperatorRequeue, requeueReason };
}

function deriveDriftFlags(input: {
  contractFound: boolean;
  hasTaskLink: boolean;
  messageCount: number;
  taskExecutionStatus?: TaskExecutionStatus | null;
  runCount: number;
  checkpointCount: number;
  webhookEventCount: number;
  hasSuccessfulWebhookEvidence?: boolean;
  hasRetryableWebhookFailure?: boolean;
  hasMissingWebhookPayload?: boolean;
  allParticipantsAccepted: boolean | null;
  contractStatus?: string | null;
}) {
  const flags: string[] = [];
  if (input.contractFound && !input.hasTaskLink) flags.push('Contract has no linked task.');
  if (input.contractFound && input.hasTaskLink && input.messageCount === 0) flags.push('Contract has linked task(s) but no visible messages.');
  if (input.taskExecutionStatus && input.taskExecutionStatus !== 'idle' && input.runCount === 0) flags.push('Task snapshot shows execution state but no execution runs were found.');
  if (input.runCount > 0 && input.checkpointCount === 0) flags.push('Execution runs exist but no checkpoints were recorded.');
  if ((input.contractFound || input.taskExecutionStatus) && input.webhookEventCount === 0) flags.push('No webhook delivery evidence found for this flow.');
  if ((input.contractFound || input.taskExecutionStatus) && input.webhookEventCount > 0 && !input.hasSuccessfulWebhookEvidence) {
    flags.push(input.hasRetryableWebhookFailure
      ? 'Webhook evidence exists, but every matching delivery is still retrying or waiting to retry.'
      : 'Webhook evidence exists, but no matching delivery has succeeded.');
  }
  if (input.hasMissingWebhookPayload) flags.push('Some webhook deliveries are missing stored event payloads, so replay/debug evidence is incomplete.');
  if (input.contractFound && input.allParticipantsAccepted === false && input.contractStatus === 'active') flags.push('Contract is active but not all participants show accepted.');
  return flags;
}

test('deriveDriftFlags catches the exact protocol drift classes we care about', () => {
  const flags = deriveDriftFlags({
    contractFound: true,
    hasTaskLink: false,
    messageCount: 0,
    taskExecutionStatus: 'running',
    runCount: 0,
    checkpointCount: 0,
    webhookEventCount: 0,
    allParticipantsAccepted: false,
    contractStatus: 'active',
  });

  assert.deepEqual(flags, [
    'Contract has no linked task.',
    'Task snapshot shows execution state but no execution runs were found.',
    'No webhook delivery evidence found for this flow.',
    'Contract is active but not all participants show accepted.',
  ]);
});

test('deriveDriftFlags distinguishes retrying webhook evidence from terminal webhook failure', () => {
  const retryingFlags = deriveDriftFlags({
    contractFound: true,
    hasTaskLink: true,
    messageCount: 1,
    taskExecutionStatus: 'running',
    runCount: 1,
    checkpointCount: 1,
    webhookEventCount: 2,
    hasSuccessfulWebhookEvidence: false,
    hasRetryableWebhookFailure: true,
    allParticipantsAccepted: true,
    contractStatus: 'active',
  });

  const failedFlags = deriveDriftFlags({
    contractFound: true,
    hasTaskLink: true,
    messageCount: 1,
    taskExecutionStatus: 'running',
    runCount: 1,
    checkpointCount: 1,
    webhookEventCount: 2,
    hasSuccessfulWebhookEvidence: false,
    hasRetryableWebhookFailure: false,
    allParticipantsAccepted: true,
    contractStatus: 'active',
  });

  assert.deepEqual(retryingFlags, [
    'Webhook evidence exists, but every matching delivery is still retrying or waiting to retry.',
  ]);

  assert.deepEqual(failedFlags, [
    'Webhook evidence exists, but no matching delivery has succeeded.',
  ]);
});

test('deriveDriftFlags calls out missing stored webhook payloads for replay debugging', () => {
  const flags = deriveDriftFlags({
    contractFound: true,
    hasTaskLink: true,
    messageCount: 2,
    taskExecutionStatus: 'succeeded',
    runCount: 1,
    checkpointCount: 1,
    webhookEventCount: 1,
    hasSuccessfulWebhookEvidence: true,
    hasRetryableWebhookFailure: false,
    hasMissingWebhookPayload: true,
    allParticipantsAccepted: true,
    contractStatus: 'active',
  });

  assert.deepEqual(flags, [
    'Some webhook deliveries are missing stored event payloads, so replay/debug evidence is incomplete.',
  ]);
});

test('deriveDriftFlags stays quiet for a healthy linked flow', () => {
  const flags = deriveDriftFlags({
    contractFound: true,
    hasTaskLink: true,
    messageCount: 3,
    taskExecutionStatus: 'succeeded',
    runCount: 1,
    checkpointCount: 2,
    webhookEventCount: 4,
    hasSuccessfulWebhookEvidence: true,
    hasRetryableWebhookFailure: false,
    hasMissingWebhookPayload: false,
    allParticipantsAccepted: true,
    contractStatus: 'active',
  });

  assert.deepEqual(flags, []);
});

test('operator requeue state only allows failed or pending-retry deliveries with payload and attempts remaining', () => {
  assert.deepEqual(
    deriveOperatorRequeueState({ status: 'failed', attempts: 2, maxRetries: 5, hasEventPayload: true }),
    { canOperatorRequeue: true, requeueReason: null },
  );

  assert.deepEqual(
    deriveOperatorRequeueState({ status: 'pending_retry', attempts: 1, maxRetries: 5, hasEventPayload: true }),
    { canOperatorRequeue: true, requeueReason: null },
  );

  assert.deepEqual(
    deriveOperatorRequeueState({ status: 'success', attempts: 1, maxRetries: 5, hasEventPayload: true }),
    {
      canOperatorRequeue: false,
      requeueReason: 'Successful deliveries are intentionally not replayable here',
    },
  );

  assert.deepEqual(
    deriveOperatorRequeueState({ status: 'retrying', attempts: 2, maxRetries: 5, hasEventPayload: true }),
    {
      canOperatorRequeue: false,
      requeueReason: 'Delivery is already in flight',
    },
  );

  assert.deepEqual(
    deriveOperatorRequeueState({ status: 'failed', attempts: 5, maxRetries: 5, hasEventPayload: true }),
    {
      canOperatorRequeue: false,
      requeueReason: 'Retry budget exhausted',
    },
  );

  assert.deepEqual(
    deriveOperatorRequeueState({ status: 'failed', attempts: 2, maxRetries: 5, hasEventPayload: false }),
    {
      canOperatorRequeue: false,
      requeueReason: 'Stored event payload missing',
    },
  );
});
