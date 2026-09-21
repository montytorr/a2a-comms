import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCloseOutcome, outcomeIsSuccess } from '@/lib/contract-closure';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

test('the outcome distinguishes work accepted from a conversation that merely stopped', () => {
  assert.equal(resolveCloseOutcome({ closedBy: 'system:completion-approved' }), 'completed-approved');
  assert.equal(resolveCloseOutcome({ closedBy: 'system:max-turns' }), 'turns-exhausted');
  assert.equal(resolveCloseOutcome({ closedBy: 'system:expiry' }), 'expired');
  assert.equal(resolveCloseOutcome({ closedBy: 'clawclaw' }), 'closed-by-participant');
  assert.equal(resolveCloseOutcome({}), 'closed-by-participant');
});

test('a gated contract that reaches its cap already approved has completed', () => {
  // insert_message_atomic only lets a gated contract auto-close on max turns
  // once its approval is recorded, so this shape means acceptance, not exhaustion.
  assert.equal(
    resolveCloseOutcome({ closedBy: 'system:max-turns', completionApprovedAt: '2026-09-17T12:00:00Z' }),
    'completed-approved',
  );
});

test('only an approved completion asserts the work was accepted', () => {
  assert.equal(outcomeIsSuccess('completed-approved'), true);
  for (const outcome of ['turns-exhausted', 'expired', 'closed-by-participant'] as const) {
    assert.equal(outcomeIsSuccess(outcome), false, `${outcome} must not read as success`);
  }
});

test('every closure path emits, not just the explicit close route', () => {
  // Four of five paths used to close a contract silently.
  const closeRoute = read('src/app/api/v1/contracts/[id]/close/route.ts');
  assert.match(closeRoute, /emitContractClosed\(/);
  assert.doesNotMatch(closeRoute, /deliverWebhooks\(/);
  assert.doesNotMatch(closeRoute, /from '@\/lib\/webhooks'/);
  assert.match(read('src/app/api/v1/contracts/_helpers.ts'), /emitContractClosed\(/);

  const messages = read('src/app/api/v1/contracts/[id]/messages/route.ts');
  assert.match(messages, /closedByMaxTurns/);
  assert.match(messages, /closedByApproval/);
  assert.match(messages, /system:completion-approved/);
  assert.match(messages, /system:max-turns/);
});

test('a contract that never activated expires rather than closing', () => {
  const closure = read('src/lib/contract-closure.ts');
  assert.match(closure, /input\.status === 'expired' \? 'contract\.expired' : 'contract\.closed'/);
});

test('the scheduled expiry sweep records who closed it and enqueues the event', () => {
  // The scheduled path is this SQL wrapper, not the python script in the skill.
  // It runs from /usr/local/sbin; ops/bin holds the source of truth.
  const sweep = read('ops/bin/a2a-contract-expiry-sweep');
  assert.match(sweep, /closed_by = 'system:expiry'/);
  assert.match(sweep, /closed_by_kind = 'system'/);
  assert.match(sweep, /INSERT INTO public\.webhook_deliveries/);
  assert.match(sweep, /'pending_retry'/);
  assert.match(sweep, /contract_state/);  // legacy alias still honoured
});
