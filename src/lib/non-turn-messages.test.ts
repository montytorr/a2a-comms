import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { consumesTurn, NON_TURN_MESSAGE_TYPES } from '@/lib/types';
import { extractSignals, resolvePrimaryAttention } from '@/lib/contract-message-notifications';

const repoRoot = process.cwd();
const read = (p: string) => readFileSync(join(repoRoot, p), 'utf8');

test('receipts and approvals are the only message types that do not spend a turn', () => {
  assert.equal(consumesTurn('receipt'), false);
  assert.equal(consumesTurn('approval'), false);
  for (const type of ['message', 'request', 'response', 'update', 'status'] as const) {
    assert.equal(consumesTurn(type), true, `${type} must still consume a turn`);
  }
  assert.equal(NON_TURN_MESSAGE_TYPES.size, 2);
});

test('a non-turn message never asks the recipient for follow-up', () => {
  assert.equal(resolvePrimaryAttention('receipt', []), 'receipt');
  assert.equal(resolvePrimaryAttention('approval', ['blocked']), 'receipt');
});

test('a turn-consuming message defaults to action-required, and declared states win', () => {
  assert.equal(resolvePrimaryAttention('message', []), 'action-required');
  assert.equal(resolvePrimaryAttention('update', ['completed']), 'completed');
  // Highest-priority signal wins so one delivery can carry several states.
  assert.equal(resolvePrimaryAttention('update', ['completed', 'blocked']), 'blocked');
  assert.equal(resolvePrimaryAttention('update', ['waiting', 'pending-approval']), 'pending-approval');
});

test('async states are still detected from the payload', () => {
  assert.deepEqual(extractSignals({ status: 'blocked' }), ['blocked']);
  assert.deepEqual(extractSignals({ nested: { review_state: 'pending-approval' } }), ['pending-approval']);
  assert.deepEqual(extractSignals({ summary: 'nothing declared' }), []);
});

test('the messages route lets bookkeeping through the turn cap but not moves', () => {
  const route = read('src/app/api/v1/contracts/[id]/messages/route.ts');

  // receipt/approval are accepted types
  assert.match(route, /VALID_MESSAGE_TYPES: MessageType\[\] = \[[^\]]*'receipt'[^\]]*'approval'[^\]]*\]/);
  // the cap check is type-aware, and runs after the type is known
  assert.match(route, /if \(!isNonTurn && checked\.current_turns >= checked\.max_turns\)/);
  assert.ok(
    route.indexOf('const isNonTurn') < route.indexOf('current_turns >= checked.max_turns'),
    'the turn cap must be evaluated only after the message type is known',
  );
  // a contract's payload schema must not reject protocol control messages
  assert.match(route, /if \(checked\.message_schema && !isNonTurn\)/);
  // only the proposer may satisfy the gate, and the DB is told about it
  assert.match(route, /approvesCompletion && auth\.agent\.id !== checked\.proposer_id/);
  assert.match(route, /p_approves_completion: approvesCompletion/);
});

test('one message produces exactly one webhook delivery, carrying its own identity', () => {
  const route = read('src/app/api/v1/contracts/[id]/messages/route.ts');

  // The per-signal fan-out is gone: signals ride along on the message event.
  assert.doesNotMatch(route, /notifyContractMessageSignals/);
  assert.equal(route.match(/deliverWebhooks\(/g)?.length, 1, 'exactly one webhook delivery per message');

  for (const field of [
    'message_id: messageId',
    'consumes_turn: !isNonTurn',
    'requires_action: requiresAction',
    'attention,',
    'attention_signals: signals',
  ]) {
    assert.ok(route.includes(field), `webhook payload must carry ${field}`);
  }
});

test('the close route refuses to complete a contract whose approval gate is open', () => {
  const closeRoute = read('src/app/api/v1/contracts/[id]/close/route.ts');
  assert.match(closeRoute, /completion_requires_approval && !gated\.completion_approved_at/);
  assert.match(closeRoute, /COMPLETION_APPROVAL_REQUIRED/);
});

test('the migration keeps non-turn messages free and holds a gated contract open at the cap', () => {
  const migration = read('supabase/migrations/20260917150000_non_turn_messages_and_completion_approval.sql');

  assert.match(migration, /v_consumes_turn := p_message_type NOT IN \('receipt', 'approval'\)/);
  // the cap blocks moves only
  assert.match(migration, /IF v_consumes_turn AND v_contract\.current_turns >= v_contract\.max_turns THEN/);
  // exhausting the budget is not acceptance
  assert.match(migration, /v_approval_pending := v_contract\.completion_requires_approval AND v_approved_at IS NULL/);
  assert.match(migration, /WHEN v_max_reached AND NOT v_approval_pending THEN 'closed'/);
  // approval at the cap is the completion
  assert.match(migration, /Completed with proposer approval/);
  // only the proposer
  assert.match(migration, /Only the contract proposer can approve completion/);
  // re-runnable
  assert.match(migration, /CREATE OR REPLACE FUNCTION insert_message_atomic/);
});
