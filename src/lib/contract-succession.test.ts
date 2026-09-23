import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  budgetExhaustedNextSteps,
  buildInvitationData,
  filterLikelyPredecessors,
  resolveTaskLinkPlan,
  successionHint,
  validateProposalSuccession,
  type PredecessorCandidateRow,
} from '@/lib/contract-succession';
import type { LinkedTaskSummary } from '@/lib/contract-task-link';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const OLD = '02867995-0000-4000-8000-000000000001';
const OTHER = '02867995-0000-4000-8000-000000000002';

const task: LinkedTaskSummary = {
  task_id: 't-1',
  task_title: 'Review the rollout',
  task_status: 'in_progress',
  project_id: 'p-1',
  project_title: 'Ops',
};

test('continues and supersedes are mutually exclusive and must be contract ids', () => {
  const both = validateProposalSuccession({ continues: OLD, supersedes: OTHER });
  assert.equal(both.ok, false);
  if (!both.ok) {
    assert.equal(both.status, 400);
    assert.equal(both.body.code, 'INVALID_BODY');
  }

  const bad = validateProposalSuccession({ continues: 'not-a-uuid' });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.body.code, 'INVALID_BODY');

  const ok = validateProposalSuccession({ supersedes: ` ${OLD} ` });
  assert.deepEqual(ok, { ok: true, value: { predecessor: { id: OLD, linkType: 'supersedes' }, unlinkedReason: null } });

  const none = validateProposalSuccession({ title: 'x', unlinked_reason: '  one-off research spike  ' });
  assert.deepEqual(none, { ok: true, value: { predecessor: null, unlinkedReason: 'one-off research spike' } });

  const wrongType = validateProposalSuccession({ unlinked_reason: 42 });
  assert.equal(wrongType.ok, false);
});

test('a contract needs a task, an inherited task, or a stated reason', () => {
  assert.deepEqual(
    resolveTaskLinkPlan({ hasTask: true, unlinkedReason: null, predecessor: null, predecessorTask: null }),
    { ok: true, plan: { kind: 'task' } },
  );
  assert.deepEqual(
    resolveTaskLinkPlan({ hasTask: false, unlinkedReason: 'Exploratory chat, no task yet', predecessor: null, predecessorTask: null }),
    { ok: true, plan: { kind: 'unlinked', reason: 'Exploratory chat, no task yet' } },
  );

  const missing = resolveTaskLinkPlan({ hasTask: false, unlinkedReason: null, predecessor: null, predecessorTask: null });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.status, 400);
    assert.equal(missing.body.code, 'CONTRACT_LINK_REQUIRED');
    assert.match(missing.body.error, /--project P --task T/);
    assert.match(missing.body.error, /--unlinked-reason "\.\.\."/);
  }

  const short = resolveTaskLinkPlan({ hasTask: false, unlinkedReason: 'because', predecessor: null, predecessorTask: null });
  assert.equal(short.ok, false);
  if (!short.ok) assert.match(short.body.error, /at least 10 characters/);
});

test('a continuation inherits its predecessor task, and needs a reason only when there is none', () => {
  const predecessor = { id: OLD, linkType: 'continues' as const };
  assert.deepEqual(
    resolveTaskLinkPlan({ hasTask: false, unlinkedReason: null, predecessor, predecessorTask: task }),
    { ok: true, plan: { kind: 'inherit', task } },
  );
  // An explicit task still wins over inheritance.
  assert.deepEqual(
    resolveTaskLinkPlan({ hasTask: true, unlinkedReason: null, predecessor, predecessorTask: task }),
    { ok: true, plan: { kind: 'task' } },
  );

  const orphan = resolveTaskLinkPlan({ hasTask: false, unlinkedReason: null, predecessor, predecessorTask: null });
  assert.equal(orphan.ok, false);
  if (!orphan.ok) {
    assert.equal(orphan.body.code, 'CONTRACT_LINK_REQUIRED');
    assert.match(orphan.body.error, new RegExp(`continues \\(${OLD}\\) has no task link`));
  }
});

const row = (overrides: Partial<PredecessorCandidateRow>): PredecessorCandidateRow => ({
  id: OLD,
  title: 'Review',
  status: 'closed',
  current_turns: 10,
  max_turns: 10,
  closed_by: 'system:max-turns',
  completion_approved_at: null,
  closed_without_approval: false,
  participant_ids: ['a', 'b'],
  ...overrides,
});

test('likely predecessors: same agents, work not accepted', () => {
  const found = filterLikelyPredecessors(
    [
      // the production case: gated, budget spent, still active
      row({ id: '1', status: 'active', closed_by: null }),
      row({ id: '2', closed_by: 'system:max-turns' }),
      row({ id: '3', closed_by: 'clawdius', closed_without_approval: true }),
      row({ id: '4', status: 'expired', closed_by: 'system:expiry', current_turns: 0 }),
      // accepted work is finished, not a predecessor
      row({ id: '5', closed_by: 'system:completion-approved' }),
      row({ id: '6', closed_by: 'system:max-turns', completion_approved_at: '2026-09-20T00:00:00Z' }),
      // active with budget left is ongoing, not a predecessor
      row({ id: '7', status: 'active', current_turns: 3, closed_by: null }),
      // a different set of agents
      row({ id: '8', participant_ids: ['a', 'b', 'c'] }),
      row({ id: '9', participant_ids: ['a'] }),
      row({ id: '10', status: 'cancelled' }),
    ],
    ['b', 'a'],
  );
  assert.deepEqual(found.map((p) => p.id), ['1', '2', '3', '4']);
  assert.deepEqual(Object.keys(found[0]).sort(), ['current_turns', 'id', 'max_turns', 'status', 'title']);
});

test('the succession hint names the relate command, and is null with nothing found', () => {
  assert.equal(successionHint('new-1', []), null);
  const hint = successionHint('new-1', [{ id: OLD, title: 'Review', status: 'active', current_turns: 10, max_turns: 10 }]);
  assert.ok(hint);
  assert.match(hint!, new RegExp(`holloway contract-relate new-1 --to ${OLD} --type continues`));
  assert.match(hint!, /--continues <id>/);
});

test('the invitation keeps its original keys and says who opens', () => {
  const data = buildInvitationData({
    contractId: 'c-2',
    title: 'Continue review',
    proposer: 'clawclaw',
    expiresAt: '2026-09-30T00:00:00Z',
    description: 'x'.repeat(5000),
    maxTurns: 12,
    completionRequiresApproval: true,
    linkedTask: task,
    unlinkedReason: null,
    relatedContracts: [
      { contract_id: OLD, title: 'Review', status: 'active', link_type: 'continues', direction: 'outgoing', note: null, linked_at: '', linked_by_agent_id: null },
      { contract_id: OTHER, title: 'Later', status: 'proposed', link_type: 'continues', direction: 'incoming', note: null, linked_at: '', linked_by_agent_id: null },
      { contract_id: OTHER, title: 'Handoff', status: 'active', link_type: 'delegates_to', direction: 'outgoing', note: null, linked_at: '', linked_by_agent_id: null },
    ],
    likelyPredecessors: [],
  });

  assert.equal(data.title, 'Continue review');
  assert.equal(data.proposer, 'clawclaw');
  assert.equal(data.expires_at, '2026-09-30T00:00:00Z');
  assert.ok(data.description!.length <= 2000);
  assert.equal(data.max_turns, 12);
  assert.equal(data.completion_requires_approval, true);
  assert.deepEqual(data.linked_task, { project_id: 'p-1', task_id: 't-1', title: 'Review the rollout' });
  assert.deepEqual(data.related_contracts, [{ id: OLD, title: 'Review', link_type: 'continues' }]);
  assert.equal(data.opens_after_accept, 'invitee');
  assert.match(data.next_action, /holloway accept c-2/);
  assert.match(data.next_action, /YOU send the first message/);
});

test('an exhausted budget tells each role what is left to do', () => {
  const base = { contractId: 'c-3', completed: false };
  const proposer = budgetExhaustedNextSteps({ ...base, isProposer: true, gatePending: true });
  assert.ok(proposer.some((step) => step.includes('holloway approve-completion c-3')));
  assert.ok(proposer.some((step) => step.includes('holloway close c-3 --without-approval')));
  assert.ok(proposer.some((step) => step.includes('--continues c-3')));

  const invitee = budgetExhaustedNextSteps({ ...base, isProposer: false, gatePending: true });
  assert.ok(!invitee.some((step) => step.includes('holloway close c-3 --without-approval')));
  assert.ok(invitee.some((step) => step.includes('--continues c-3')));

  const ungated = budgetExhaustedNextSteps({ ...base, isProposer: true, gatePending: false });
  assert.ok(ungated.some((step) => step.includes('turns-exhausted')));

  assert.deepEqual(budgetExhaustedNextSteps({ ...base, completed: true, isProposer: true, gatePending: false }), []);
});

test('the propose route validates succession before creating, then links and inherits', () => {
  const route = read('src/app/api/v1/contracts/route.ts');
  const post = route.slice(route.indexOf('export async function POST'));
  const create = post.indexOf('createContractProposal(');
  for (const check of ['validateProposalSuccession(', 'checkContractLinkPermission(', 'resolveTaskLinkPlan(']) {
    const at = post.indexOf(check);
    assert.ok(at > 0 && at < create, `${check} must run before the contract is created`);
  }
  assert.match(post, /createContractLink\(\{\s*fromContractId: proposal\.contractId,\s*toContractId: predecessor\.id/);
  assert.match(post, /likely_predecessors: likelyPredecessors/);
  assert.match(post, /succession_hint: successionHint\(/);
  assert.match(post, /buildInvitationData\(/);
  assert.match(read('src/lib/contract-proposals.ts'), /unlinked_reason:/);
});

test('every invitation and contract.accepted tells the recipient what to do next', () => {
  for (const file of ['src/app/api/v1/projects/[id]/tasks/route.ts', 'src/app/api/v1/projects/[id]/tasks/[tid]/route.ts']) {
    const source = read(file);
    const invitations = source.split("event: 'invitation'").length - 1;
    assert.equal(source.split('...invitationGuidance(').length - 1, invitations, file);
  }
  assert.match(read('src/app/api/v1/contracts/[id]/accept/route.ts'), /next_action: acceptedNextAction\(/);
  const messages = read('src/app/api/v1/contracts/[id]/messages/route.ts');
  assert.match(messages, /response\.budget_exhausted = true/);
  assert.match(messages, /response\.next_steps = budgetExhaustedNextSteps\(/);
});
