import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateContractParticipantMutation } from './contract-trust-policy';

test('observer contract mutations are denied with action-specific messages', () => {
  assert.deepEqual(evaluateContractParticipantMutation('accept', { role: 'observer', status: 'pending' }), {
    allowed: false,
    status: 403,
    body: { error: 'Observers may inspect contract context but cannot accept contracts', code: 'FORBIDDEN' },
  });

  assert.deepEqual(evaluateContractParticipantMutation('reject', { role: 'observer', status: 'pending' }), {
    allowed: false,
    status: 403,
    body: { error: 'Observers may inspect contract context but cannot reject contracts', code: 'FORBIDDEN' },
  });

  assert.deepEqual(evaluateContractParticipantMutation('cancel', { role: 'observer', status: 'pending' }), {
    allowed: false,
    status: 403,
    body: { error: 'Observers may inspect contract context but cannot cancel contracts', code: 'FORBIDDEN' },
  });

  assert.deepEqual(evaluateContractParticipantMutation('send-message', { role: 'observer', status: 'accepted' }), {
    allowed: false,
    status: 403,
    body: { error: 'Observers may inspect contract context but cannot send messages', code: 'FORBIDDEN' },
  });

  assert.deepEqual(evaluateContractParticipantMutation('close', { role: 'observer', status: 'accepted' }), {
    allowed: false,
    status: 403,
    body: { error: 'Observers may inspect contract context but cannot close contracts', code: 'FORBIDDEN' },
  });

  assert.deepEqual(evaluateContractParticipantMutation('upload-attachment', { role: 'observer', status: 'accepted' }), {
    allowed: false,
    status: 403,
    body: { error: 'Observers may inspect contract artifacts but cannot upload new ones', code: 'FORBIDDEN' },
  });
});

test('proposer cannot accept or reject their own contract but can cancel it', () => {
  assert.deepEqual(evaluateContractParticipantMutation('accept', { role: 'proposer', status: 'pending' }), {
    allowed: false,
    status: 403,
    body: { error: 'Proposers cannot accept their own contracts', code: 'FORBIDDEN' },
  });

  assert.deepEqual(evaluateContractParticipantMutation('reject', { role: 'proposer', status: 'pending' }), {
    allowed: false,
    status: 403,
    body: { error: 'Proposers cannot reject their own contracts', code: 'FORBIDDEN' },
  });

  assert.deepEqual(evaluateContractParticipantMutation('cancel', { role: 'proposer', status: 'pending' }), {
    allowed: true,
    status: 200,
  });
});

test('invitee response actions require pending status', () => {
  assert.deepEqual(evaluateContractParticipantMutation('accept', { role: 'invitee', status: 'accepted' }), {
    allowed: false,
    status: 409,
    body: { error: 'Already responded: accepted', code: 'ALREADY_RESPONDED' },
  });

  assert.deepEqual(evaluateContractParticipantMutation('reject', { role: 'invitee', status: 'rejected' }), {
    allowed: false,
    status: 409,
    body: { error: 'Already responded: rejected', code: 'ALREADY_RESPONDED' },
  });

  assert.deepEqual(evaluateContractParticipantMutation('accept', { role: 'invitee', status: 'pending' }), {
    allowed: true,
    status: 200,
  });

  assert.deepEqual(evaluateContractParticipantMutation('reject', { role: 'invitee', status: 'pending' }), {
    allowed: true,
    status: 200,
  });
});

test('non-proposers cannot cancel contracts', () => {
  assert.deepEqual(evaluateContractParticipantMutation('cancel', { role: 'invitee', status: 'pending' }), {
    allowed: false,
    status: 403,
    body: { error: 'Only the proposer can cancel a contract', code: 'FORBIDDEN' },
  });
});
