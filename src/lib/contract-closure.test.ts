import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  evaluateGatedClose,
  needsSuccessorHint,
  outcomeIsSuccess,
  resolveCloseOutcome,
  successorHint,
} from '@/lib/contract-closure';

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
  for (const outcome of ['turns-exhausted', 'expired', 'closed-by-participant', 'closed-unapproved'] as const) {
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

test('the dashboard close action emits contract.closed and returns refusals instead of throwing', () => {
  // A thrown server-action error reaches a production browser as a generic
  // "Server Components render" message, hiding why the close was refused.
  const action = read('src/app/(dashboard)/contracts/[id]/actions.ts');
  const closeAction = action.slice(action.indexOf('export async function closeContract'));
  assert.match(closeAction, /emitContractClosed\(/);
  assert.doesNotMatch(closeAction, /throw new Error/);
  assert.match(closeAction, /completion_requires_approval && !contract\.completion_approved_at/);
  assert.match(closeAction, /closed_without_approval: closedWithoutApproval/);
  assert.match(closeAction, /UNAPPROVED_CLOSE_REASON_MIN/);
});

test('closed-unapproved is read from the row, whoever closed it', () => {
  // closed_by is a free-text actor name; the outcome must not depend on it.
  assert.equal(resolveCloseOutcome({ closedBy: 'clawdius', closedWithoutApproval: true }), 'closed-unapproved');
  assert.equal(resolveCloseOutcome({ closedBy: 'ops@example.com', closedWithoutApproval: true }), 'closed-unapproved');
  assert.equal(resolveCloseOutcome({ closedBy: 'clawdius', closedWithoutApproval: false }), 'closed-by-participant');
  assert.equal(outcomeIsSuccess('closed-unapproved'), false);
});

const gated = { contractId: 'c-1', gatePending: true };

test('an ungated or approved contract closes normally, and without_approval changes nothing', () => {
  assert.deepEqual(
    evaluateGatedClose({ ...gated, gatePending: false, isProposer: false }),
    { allowed: true, closedWithoutApproval: false },
  );
  assert.deepEqual(
    evaluateGatedClose({ ...gated, gatePending: false, isProposer: true, withoutApproval: true, reason: 'x' }),
    { allowed: true, closedWithoutApproval: false },
  );
});

test('the proposer may close a pending gate only explicitly and with a reason', () => {
  assert.deepEqual(
    evaluateGatedClose({ ...gated, isProposer: true, withoutApproval: true, reason: 'Scope changed, not accepting.' }),
    { allowed: true, closedWithoutApproval: true },
  );
  for (const attempt of [
    { withoutApproval: false, reason: 'Scope changed, not accepting.' },
    { withoutApproval: true, reason: 'too short' },
    { withoutApproval: true, reason: '          ' },
    { withoutApproval: true },
  ]) {
    const decision = evaluateGatedClose({ ...gated, isProposer: true, ...attempt });
    assert.equal(decision.allowed, false, JSON.stringify(attempt));
    if (!decision.allowed) {
      assert.equal(decision.status, 409);
      assert.equal(decision.body.code, 'COMPLETION_APPROVAL_REQUIRED');
    }
  }
});

test('an invitee can never close an unapproved gated contract, and is told both ways out', () => {
  const decision = evaluateGatedClose({
    ...gated,
    isProposer: false,
    withoutApproval: true,
    reason: 'I think the work is finished now.',
  });
  assert.equal(decision.allowed, false);
  if (!decision.allowed) {
    assert.equal(decision.body.code, 'COMPLETION_APPROVAL_REQUIRED');
    assert.match(decision.body.error, /holloway approve-completion c-1/);
    assert.match(decision.body.error, /holloway close c-1 --without-approval --reason/);
  }
});

test('the successor hint is for unaccepted endings that nothing continues', () => {
  assert.equal(needsSuccessorHint('completed-approved', false), false);
  assert.equal(needsSuccessorHint('turns-exhausted', true), false);
  for (const outcome of ['turns-exhausted', 'expired', 'closed-by-participant', 'closed-unapproved'] as const) {
    assert.equal(needsSuccessorHint(outcome, false), true, outcome);
  }
  assert.match(successorHint('c-9'), /holloway propose \.\.\. --continues c-9/);
});

test('contract.closed carries closed-unapproved, work_accepted and the successor hint', () => {
  const lib = read('src/lib/contract-closure.ts');
  assert.match(lib, /closedWithoutApproval: input\.closedWithoutApproval/);
  assert.match(lib, /work_accepted: outcomeIsSuccess\(outcome\)/);
  assert.match(lib, /successor_hint: hint/);
  // A successor of X is a row pointing TO X (continues/supersedes), or X delegating onward.
  assert.match(lib, /\.eq\('to_contract_id', contractId\)\s*\.in\('link_type', \['continues', 'supersedes'\]\)/);
  assert.match(lib, /\.eq\('from_contract_id', contractId\)\s*\.eq\('link_type', 'delegates_to'\)/);

  const closeRoute = read('src/app/api/v1/contracts/[id]/close/route.ts');
  assert.match(closeRoute, /evaluateGatedClose\(/);
  assert.match(closeRoute, /closed_without_approval: gate\.closedWithoutApproval/);
  assert.match(closeRoute, /closedWithoutApproval: gate\.closedWithoutApproval/);
  assert.match(closeRoute, /is\('completion_approved_at', null\)/);
});

test('the migration records unapproved closes and unlinked reasons additively', () => {
  const migration = read('migrations/20260923090000_contract_succession_enforcement.sql');
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^COMMIT;/m);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS closed_without_approval boolean NOT NULL DEFAULT false/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS unlinked_reason text/);
  assert.doesNotMatch(migration, /service_role|DROP /i);
});
