import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveContractTurnState } from '@/lib/contract-turn-state';
import type { TurnStateLastMessage, TurnStateParticipant } from '@/lib/contract-turn-state';
import type { Contract, ContractStatus } from '@/lib/types';

const PROPOSER = 'agent-proposer';
const ACCEPTER = 'agent-accepter';

type C = Pick<Contract, 'status' | 'proposer_id' | 'current_turns' | 'max_turns' | 'completion_requires_approval' | 'completion_approved_at'>;

const contract = (over: Partial<C> = {}): C => ({
  status: 'active',
  proposer_id: PROPOSER,
  current_turns: 3,
  max_turns: 30,
  completion_requires_approval: false,
  completion_approved_at: null,
  ...over,
});

const twoParty = (accepterStatus: TurnStateParticipant['status'] = 'accepted'): TurnStateParticipant[] => [
  { agent_id: PROPOSER, role: 'proposer', status: 'accepted', name: 'alpha' },
  { agent_id: ACCEPTER, role: 'invitee', status: accepterStatus, name: 'beta' },
];

const message = (over: Partial<TurnStateLastMessage> = {}): TurnStateLastMessage => ({
  sender_id: PROPOSER,
  message_type: 'update',
  requires_action: true,
  consumes_turn: true,
  created_at: '2026-09-18T09:00:00.000Z',
  ...over,
});

const derive = (
  c: C,
  viewerAgentId: string,
  lastMessage: TurnStateLastMessage | null = null,
  participants = twoParty()
) => deriveContractTurnState({ contract: c, viewerAgentId, participants, lastMessage });

test('an ended contract owes nothing, whoever is looking', () => {
  for (const status of ['closed', 'expired', 'cancelled', 'rejected'] as ContractStatus[]) {
    for (const viewer of [PROPOSER, ACCEPTER]) {
      const result = derive(contract({ status }), viewer, message());
      assert.equal(result.awaiting, 'nobody', `${status}/${viewer}`);
      assert.match(result.reason, new RegExp(status));
    }
  }
});

test('a proposed contract waits on the invitee, and says so to each side', () => {
  const asInvitee = derive(contract({ status: 'proposed' }), ACCEPTER, null, twoParty('pending'));
  assert.equal(asInvitee.awaiting, 'you');
  assert.equal(asInvitee.awaiting_agent_id, ACCEPTER);
  assert.match(asInvitee.reason, /accepted or rejected/);

  const asProposer = derive(contract({ status: 'proposed' }), PROPOSER, null, twoParty('pending'));
  assert.equal(asProposer.awaiting, 'peer');
});

test('THE ACCEPTER OPENS: an active contract with no messages waits on them', () => {
  const asAccepter = derive(contract(), ACCEPTER);
  assert.equal(asAccepter.awaiting, 'you');
  assert.equal(asAccepter.awaiting_agent_id, ACCEPTER);
  assert.equal(asAccepter.awaiting_agent_name, 'beta');
  assert.match(asAccepter.reason, /first message is yours/);

  const asProposer = derive(contract(), PROPOSER);
  assert.equal(asProposer.awaiting, 'peer');
  assert.match(asProposer.reason, /agent that accepted/);
});

test('with two accepters there is no single opener, and it says so rather than guessing', () => {
  const threeParty: TurnStateParticipant[] = [
    { agent_id: PROPOSER, role: 'proposer', status: 'accepted', name: 'alpha' },
    { agent_id: ACCEPTER, role: 'invitee', status: 'accepted', name: 'beta' },
    { agent_id: 'agent-third', role: 'invitee', status: 'accepted', name: 'gamma' },
  ];
  const result = derive(contract(), ACCEPTER, null, threeParty);
  assert.equal(result.awaiting, 'nobody');
  assert.equal(result.awaiting_agent_id, null);
  assert.match(result.reason, /no single opener/);
});

test('an observer is never the one expected to reply', () => {
  const withObserver: TurnStateParticipant[] = [
    ...twoParty(),
    { agent_id: 'agent-observer', role: 'observer', status: 'accepted', name: 'watcher' },
  ];
  const result = derive(contract(), ACCEPTER, message({ sender_id: PROPOSER }), withObserver);
  assert.equal(result.awaiting_agent_id, ACCEPTER, 'the observer must not be counted as a candidate');
  assert.equal(result.awaiting, 'you');
});

test('a message that asked for a reply puts the move on the other side', () => {
  const asAccepter = derive(contract(), ACCEPTER, message({ sender_id: PROPOSER }));
  assert.equal(asAccepter.awaiting, 'you');
  assert.match(asAccepter.reason, /was not yours/);

  const asProposer = derive(contract(), PROPOSER, message({ sender_id: PROPOSER }));
  assert.equal(asProposer.awaiting, 'peer');
  assert.match(asProposer.reason, /next move is theirs/);
});

test('requires_action false means nobody owes anything', () => {
  const result = derive(contract(), ACCEPTER, message({ sender_id: PROPOSER, requires_action: false }));
  assert.equal(result.awaiting, 'nobody');
  assert.equal(result.last_requires_action, false);
  assert.match(result.reason, /informational/);
});

test('a non-turn message never changes whose move it is', () => {
  const result = derive(
    contract(),
    ACCEPTER,
    message({ sender_id: PROPOSER, message_type: 'receipt', consumes_turn: false, requires_action: false })
  );
  assert.equal(result.awaiting, 'nobody');
  assert.match(result.reason, /receipt and asked for nothing/);
});

test('a spent budget with a completion gate waits on the proposer, not the last sender', () => {
  const spent = contract({ current_turns: 30, max_turns: 30, completion_requires_approval: true });
  const asProposer = derive(spent, PROPOSER, message({ sender_id: ACCEPTER }));
  assert.equal(asProposer.awaiting, 'you');
  assert.equal(asProposer.awaiting_agent_id, PROPOSER);
  assert.match(asProposer.reason, /records an approval/);

  const asAccepter = derive(spent, ACCEPTER, message({ sender_id: ACCEPTER }));
  assert.equal(asAccepter.awaiting, 'peer');
});

test('an approval already recorded stops the gate from claiming a move', () => {
  const spent = contract({
    current_turns: 30,
    max_turns: 30,
    completion_requires_approval: true,
    completion_approved_at: '2026-09-18T08:00:00.000Z',
  });
  const result = derive(spent, PROPOSER, message({ sender_id: ACCEPTER }));
  assert.equal(result.awaiting, 'nobody');
  assert.match(result.reason, /budget is spent/);
});

test('a spent budget with no gate owes nothing, even after a question', () => {
  const spent = contract({ current_turns: 30, max_turns: 30 });
  const result = derive(spent, ACCEPTER, message({ sender_id: PROPOSER, requires_action: true }));
  assert.equal(result.awaiting, 'nobody');
  assert.match(result.reason, /No further turn/);
});

test('the last message is reported back whatever the verdict', () => {
  const result = derive(contract(), ACCEPTER, message({ sender_id: PROPOSER }));
  assert.equal(result.last_sender_id, PROPOSER);
  assert.equal(result.last_message_at, '2026-09-18T09:00:00.000Z');
  assert.equal(result.last_requires_action, true);
});
