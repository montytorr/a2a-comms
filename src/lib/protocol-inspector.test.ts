import test from 'node:test';
import assert from 'node:assert/strict';
import type { TaskExecutionStatus } from './types';

function deriveDriftFlags(input: {
  contractFound: boolean;
  hasTaskLink: boolean;
  messageCount: number;
  taskExecutionStatus?: TaskExecutionStatus | null;
  runCount: number;
  checkpointCount: number;
  webhookEventCount: number;
  allParticipantsAccepted: boolean | null;
  contractStatus?: string | null;
}) {
  const flags: string[] = [];
  if (input.contractFound && !input.hasTaskLink) flags.push('Contract has no linked task.');
  if (input.contractFound && input.hasTaskLink && input.messageCount === 0) flags.push('Contract has linked task(s) but no visible messages.');
  if (input.taskExecutionStatus && input.taskExecutionStatus !== 'idle' && input.runCount === 0) flags.push('Task snapshot shows execution state but no execution runs were found.');
  if (input.runCount > 0 && input.checkpointCount === 0) flags.push('Execution runs exist but no checkpoints were recorded.');
  if ((input.contractFound || input.taskExecutionStatus) && input.webhookEventCount === 0) flags.push('No webhook delivery evidence found for this flow.');
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

test('deriveDriftFlags stays quiet for a healthy linked flow', () => {
  const flags = deriveDriftFlags({
    contractFound: true,
    hasTaskLink: true,
    messageCount: 3,
    taskExecutionStatus: 'succeeded',
    runCount: 1,
    checkpointCount: 2,
    webhookEventCount: 4,
    allParticipantsAccepted: true,
    contractStatus: 'active',
  });

  assert.deepEqual(flags, []);
});
