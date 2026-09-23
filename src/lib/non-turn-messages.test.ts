import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { consumesTurn, NON_TURN_MESSAGE_TYPES } from '@/lib/types';
import {
  extractSignals,
  resolvePrimaryAttention,
  resolveRequiresAction,
  validateReceiptContent,
  validateCompletionApprovalContent,
} from '@/lib/contract-message-notifications';

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
    'consumes_turn: rpcResult.consumes_turn',
    'requires_action: rpcResult.requires_action',
    'attention,',
    'attention_signals: signals',
  ]) {
    assert.ok(route.includes(field), `webhook payload must carry ${field}`);
  }
});

test('the close route refuses to complete a contract whose approval gate is open', () => {
  const closeRoute = read('src/app/api/v1/contracts/[id]/close/route.ts');
  assert.match(closeRoute, /completion_requires_approval && !gated\.completion_approved_at/);
  assert.match(closeRoute, /evaluateGatedClose\(/);
  assert.match(read('src/lib/contract-closure.ts'), /COMPLETION_APPROVAL_REQUIRED/);
});

test('the migration keeps non-turn messages free and holds a gated contract open at the cap', () => {
  const migration = read('migrations/20260917150000_non_turn_messages_and_completion_approval.sql');

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

test('a sender cannot silence a request', () => {
  // A request is the one message type that always owes an answer.
  assert.equal(resolveRequiresAction('request', false), true);
  assert.equal(resolveRequiresAction('request', undefined), true);
  // Everything else honours the sender's declaration, defaulting to actionable.
  assert.equal(resolveRequiresAction('update', false), false);
  assert.equal(resolveRequiresAction('update', undefined), true);
  // Bookkeeping never owes a reply, whatever the sender asks for.
  assert.equal(resolveRequiresAction('receipt', true), false);
  assert.equal(resolveRequiresAction('approval', true), false);
});

test('attention can say informational, which is the word the reactor looks for', () => {
  assert.equal(resolvePrimaryAttention('update', [], false), 'informational');
  assert.equal(resolvePrimaryAttention('update', [], true), 'action-required');
  // A declared async state still outranks both.
  assert.equal(resolvePrimaryAttention('update', ['blocked'], false), 'blocked');
});

test('a control message must say what it controls', () => {
  assert.match(String(validateReceiptContent({})), /content\.acknowledges/);
  assert.match(String(validateReceiptContent({ acknowledges: '   ' })), /content\.acknowledges/);
  assert.equal(validateReceiptContent({ acknowledges: 'msg-1' }), null);

  assert.match(String(validateCompletionApprovalContent({})), /approves_completion/);
  assert.match(String(validateCompletionApprovalContent({ approves_completion: 'yes' })), /approves_completion/);
  assert.equal(validateCompletionApprovalContent({ approves_completion: true }), null);
});

test('the route rejects a control message with no target', () => {
  const route = read('src/app/api/v1/contracts/[id]/messages/route.ts');
  assert.match(route, /validateReceiptContent\(parsed\.content\)/);
  assert.match(route, /validateCompletionApprovalContent\(parsed\.content\)/);
  assert.match(route, /resolveRequiresAction\(messageType, parsed\.requires_action\)/);
  assert.match(route, /resolvePrimaryAttention\(messageType, signals, requiresAction\)/);
});

test('turn accounting is persisted on the row, not only announced', () => {
  const migration = read('migrations/20260917160000_persist_turn_accounting.sql');

  // columns, backfill and index
  assert.match(migration, /ADD COLUMN IF NOT EXISTS requires_action BOOLEAN/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS consumes_turn BOOLEAN/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS turn_number INTEGER/);
  assert.match(migration, /row_number\(\) OVER \(PARTITION BY contract_id/);
  assert.match(migration, /idx_messages_contract_turn_number/);

  // both older signatures must go, or a 5-arg call binds to the old body
  assert.match(migration, /DROP FUNCTION IF EXISTS insert_message_atomic\(UUID, UUID, TEXT, JSONB\);/);
  assert.match(migration, /DROP FUNCTION IF EXISTS insert_message_atomic\(UUID, UUID, TEXT, JSONB, BOOLEAN\);/);

  // the database enforces the request rule too, not just the route
  assert.match(migration, /WHEN p_message_type = 'request' THEN true/);
  assert.match(migration, /WHEN NOT v_consumes_turn THEN false/);
});

test('the route persists and then reports back what the row recorded', () => {
  const route = read('src/app/api/v1/contracts/[id]/messages/route.ts');
  assert.match(route, /p_requires_action: requiresAction/);
  assert.match(route, /consumes_turn: rpcResult\.consumes_turn \?\? !isNonTurn/);
  assert.match(route, /turn_number: rpcResult\.turn_number \?\? newTurns/);
});

test('the dashboard shows a contract held open by its completion gate', () => {
  const page = read('src/app/(dashboard)/contracts/[id]/page.tsx');
  assert.match(page, /completion_requires_approval/);
  assert.match(page, /Approval required/);
  const actions = read('src/app/(dashboard)/contracts/[id]/actions.ts');
  assert.match(actions, /needs completion approval from/);
});

test('the attachment dead end tells an agent how to get out of it', () => {
  // An agent told only "not linked" has no next step, and an agent with no next
  // step and something to deliver will find its own. See reactor/artifacts.py.
  const route = read('src/app/api/v1/contracts/[id]/attachments/route.ts');
  assert.match(route, /CONTRACT_NOT_LINKED/);
  assert.match(route, /holloway contract-link/);
  assert.match(route, /Do not publish the file anywhere outside this platform/);
});

test('a checkpoint append allocates and consumes its sequence in one statement', () => {
  // The old path inserted the checkpoint, committed, then bumped the counter
  // under a CAS. A missed CAS threw with the row already written, so the run
  // held a checkpoint it could not count and the next append collided on
  // UNIQUE(run_id, sequence) — permanently.
  const migration = read('migrations/20260917200000_atomic_checkpoint_append.sql');
  assert.match(migration, /FROM task_execution_runs\s+WHERE id = p_run_id\s+FOR UPDATE/);
  assert.match(migration, /v_next_sequence := COALESCE\(v_run\.checkpoint_count, 0\) \+ 1/);
  // an absent summary must not overwrite the run's
  assert.match(migration, /summary = CASE WHEN p_summary_provided THEN p_summary ELSE summary END/);

  const lib = read('src/lib/task-execution.ts');
  assert.match(lib, /rpc\('append_task_checkpoint_atomic'/);
  assert.match(lib, /p_summary_provided: input\.summary !== undefined/);
  assert.doesNotMatch(lib, /Concurrent checkpoint write conflict/);
});

test('a run that stops heartbeating is cancelled and releases its task', () => {
  const migration = read('migrations/20260917210000_reap_stale_execution_runs.sql');
  // cancelled, not failed — silence is not evidence the work failed
  assert.match(migration, /SET status = 'cancelled'/);
  assert.doesNotMatch(migration, /SET status = 'failed'/);
  assert.match(migration, /not that its work failed/);
  // the half that fixes the deadlock
  assert.match(migration, /SET active_run_id = NULL/);
  // a run that died before its first heartbeat is still reaped
  assert.match(migration, /COALESCE\(r\.heartbeat_at, r\.started_at, r\.created_at\)/);
  assert.match(migration, /FOR UPDATE SKIP LOCKED/);
});

test('the stale-run sweep is built, deployed and emits its event', () => {
  assert.match(read('src/lib/webhook-events.ts'), /'task\.run_stale'/);
  assert.match(read('src/lib/types.ts'), /\| 'task\.run_stale'/);
  const sweep = read('scripts/stale-run-sweep.ts');
  assert.match(sweep, /reap_stale_execution_runs/);
  assert.match(sweep, /event: 'task\.run_stale'/);
  assert.match(sweep, /work_failed: false/);
  // built and started by the deploy, not just present in the tree
  assert.match(read('Dockerfile'), /AS stale-run-worker/);
  assert.match(read('docker-compose.yml'), /stale-run-sweep-worker:/);
  assert.match(read('scripts/ci-deploy.sh'), /build .*stale-run-sweep-worker/);
});

test('the default run status agrees with the route that creates runs', () => {
  assert.match(read('src/lib/task-execution.ts'), /input\.status \?\? 'starting'/);
  assert.match(read('src/app/api/v1/projects/[id]/tasks/[tid]/runs/route.ts'), /parsed\.status \?\? 'starting'/);
});
