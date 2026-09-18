import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveSuccessionConformance } from '@/lib/protocol-inspector';
import type { Contract, ContractStatus, RelatedContractSummary } from '@/lib/types';

const A = '11111111-1111-4111-8111-111111111111';

type InspectedContract = Pick<Contract, 'status' | 'closed_by' | 'completion_approved_at'>;

const contract = (over: Partial<InspectedContract> = {}): InspectedContract => ({
  status: 'closed',
  closed_by: 'alpha',
  completion_approved_at: null,
  ...over,
});

const link = (over: Partial<RelatedContractSummary> = {}): RelatedContractSummary => ({
  contract_id: A,
  title: 'The other one',
  status: 'closed' as ContractStatus,
  link_type: 'continues',
  direction: 'incoming',
  note: null,
  linked_at: '2026-09-18T07:00:00.000Z',
  linked_by_agent_id: null,
  ...over,
});

const derive = (
  c: InspectedContract | null,
  relatedContracts: RelatedContractSummary[] = [],
  taskSiblingContractIds: string[] = []
) => deriveSuccessionConformance({ contract: c, relatedContracts, taskSiblingContractIds });

test('no contract in scope produces no succession drift', () => {
  const result = derive(null);
  assert.deepEqual(result.driftFlags, []);
  assert.equal(result.endedWithoutCompleting, false);
});

test('a live contract is not expected to have a successor', () => {
  for (const status of ['proposed', 'active'] as ContractStatus[]) {
    const result = derive(contract({ status }));
    assert.equal(result.endedWithoutCompleting, false, status);
    assert.deepEqual(result.driftFlags, [], status);
  }
});

test('a contract whose work was accepted needs no successor', () => {
  const result = derive(contract({ closed_by: 'system:completion-approved' }));
  assert.equal(result.endedWithoutCompleting, false);
  assert.deepEqual(result.driftFlags, []);
});

test('a gated contract that hit its cap already approved counts as completed', () => {
  // resolveCloseOutcome's rule: max-turns plus a recorded approval is success.
  const result = derive(
    contract({ closed_by: 'system:max-turns', completion_approved_at: '2026-09-18T06:00:00.000Z' })
  );
  assert.equal(result.endedWithoutCompleting, false);
  assert.deepEqual(result.driftFlags, []);
});

test('each way of ending unfinished is named in the flag, not lumped together', () => {
  const cases: Array<[InspectedContract, RegExp]> = [
    [contract({ closed_by: 'system:max-turns' }), /turn budget ran out/],
    [contract({ status: 'expired', closed_by: 'system:expiry' }), /it expired/],
    [contract({ status: 'cancelled' }), /it was cancelled/],
    [contract({ status: 'rejected' }), /it was rejected/],
    [contract({ closed_by: 'alpha' }), /a participant closed it/],
  ];
  for (const [c, pattern] of cases) {
    const result = derive(c);
    assert.equal(result.endedWithoutCompleting, true, c.status + '/' + c.closed_by);
    assert.equal(result.driftFlags.length, 1);
    assert.match(result.driftFlags[0]!, pattern);
  }
});

test('a successor silences the flag, from either shape it can take', () => {
  const byContinuation = derive(contract(), [link({ direction: 'incoming', link_type: 'continues' })]);
  assert.equal(byContinuation.hasSuccessor, true);
  assert.deepEqual(byContinuation.driftFlags, []);

  const byDelegation = derive(contract(), [link({ direction: 'outgoing', link_type: 'delegates_to' })]);
  assert.equal(byDelegation.hasSuccessor, true);
  assert.deepEqual(byDelegation.driftFlags, []);
});

test('a link pointing backwards is not a successor', () => {
  // This contract continuing an older one says nothing about where its own
  // unfinished work went.
  const result = derive(contract(), [link({ direction: 'outgoing', link_type: 'continues' })]);
  assert.equal(result.hasSuccessor, false);
  assert.equal(result.driftFlags.length, 1);
  assert.match(result.driftFlags[0]!, /nothing records a successor/);
});

test('continuing a contract that is still live is a contradiction worth flagging', () => {
  for (const status of ['active', 'proposed'] as ContractStatus[]) {
    const result = derive(
      contract({ closed_by: 'system:completion-approved' }),
      [link({ direction: 'outgoing', link_type: 'continues', status })]
    );
    assert.equal(result.driftFlags.length, 1, status);
    assert.match(result.driftFlags[0]!, new RegExp(`still ${status}`));
  }
});

test('delegating to a live contract is normal and is not flagged', () => {
  // A handoff is proposed while the delegating contract's work is still open.
  const result = derive(
    contract({ closed_by: 'system:completion-approved' }),
    [link({ direction: 'outgoing', link_type: 'delegates_to', status: 'active' as ContractStatus })]
  );
  assert.deepEqual(result.driftFlags, []);
});

test('a link into this contract from a live one is not this contract\'s problem', () => {
  const result = derive(
    contract({ closed_by: 'system:completion-approved' }),
    [link({ direction: 'incoming', link_type: 'continues', status: 'active' as ContractStatus })]
  );
  assert.deepEqual(result.driftFlags, []);
});

test('task siblings with no edge are counted and flagged', () => {
  const result = derive(
    contract({ closed_by: 'system:completion-approved' }),
    [],
    ['sibling-1', 'sibling-2']
  );
  assert.equal(result.unlinkedTaskSiblingCount, 2);
  assert.match(result.driftFlags[0]!, /2 other contract\(s\) share this contract's task/);
});

test('a sibling that is already linked is not counted as unlinked', () => {
  const result = derive(
    contract({ closed_by: 'system:completion-approved' }),
    [link({ contract_id: 'sibling-1' })],
    ['sibling-1', 'sibling-2']
  );
  assert.equal(result.unlinkedTaskSiblingCount, 1);
  assert.equal(result.driftFlags.length, 1);
  assert.match(result.driftFlags[0]!, /1 other contract/);
});

test('the related count is reported whether or not anything drifted', () => {
  const result = derive(contract({ closed_by: 'system:completion-approved' }), [link(), link({ contract_id: 'b' })]);
  assert.equal(result.relatedContractCount, 2);
  assert.deepEqual(result.driftFlags, []);
});
