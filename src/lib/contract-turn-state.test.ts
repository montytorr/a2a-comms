import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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

/* ── blocking questions (AC-71) ──────────────────────────────────────────── */

const ACTIVE = {
  status: 'active' as const,
  proposer_id: PROPOSER,
  current_turns: 2,
  max_turns: 20,
  completion_requires_approval: false,
  completion_approved_at: null,
};

const BOTH = [
  { agent_id: PROPOSER, role: 'proposer' as const, status: 'accepted' as const, name: 'clawdius' },
  { agent_id: ACCEPTER, role: 'invitee' as const, status: 'accepted' as const, name: 'clawclaw' },
];

const lastFrom = (sender: string) => ({
  sender_id: sender,
  message_type: 'request',
  requires_action: true,
  consumes_turn: true,
  created_at: '2026-09-18T10:00:00Z',
});

test('a blocking question from the agent whose move it is stops the clock', () => {
  const result = deriveContractTurnState({
    contract: ACTIVE,
    viewerAgentId: ACCEPTER,
    participants: BOTH,
    lastMessage: lastFrom(PROPOSER),
    blockingQuestions: [{ asked_by_agent_id: ACCEPTER, kind: 'blocked' }],
  });
  assert.equal(result.awaiting, 'human');
  // Nobody is expected to move, so naming an agent would contradict the field.
  assert.equal(result.awaiting_agent_id, null);
  assert.match(result.reason, /You said you are blocked/);
});

test('a blocking question from the OTHER agent does not excuse the one who owes the move', () => {
  // The peer being stuck on something of its own is not a reason for this agent
  // to stop: the move is still owed, by the agent that owes it.
  const result = deriveContractTurnState({
    contract: ACTIVE,
    viewerAgentId: ACCEPTER,
    participants: BOTH,
    lastMessage: lastFrom(PROPOSER),
    blockingQuestions: [{ asked_by_agent_id: PROPOSER, kind: 'blocked' }],
  });
  assert.equal(result.awaiting, 'you');
  assert.equal(result.awaiting_agent_id, ACCEPTER);
});

test('the peer being blocked is reported by name to the agent that is waiting', () => {
  const result = deriveContractTurnState({
    contract: ACTIVE,
    viewerAgentId: PROPOSER,
    participants: BOTH,
    lastMessage: lastFrom(PROPOSER),
    blockingQuestions: [{ asked_by_agent_id: ACCEPTER, kind: 'validation' }],
  });
  assert.equal(result.awaiting, 'human');
  assert.match(result.reason, /clawclaw is waiting on a human/);
});

test('a blocking question cannot resurrect a closed contract', () => {
  const result = deriveContractTurnState({
    contract: { ...ACTIVE, status: 'closed' },
    viewerAgentId: ACCEPTER,
    participants: BOTH,
    lastMessage: lastFrom(PROPOSER),
    blockingQuestions: [{ asked_by_agent_id: ACCEPTER, kind: 'blocked' }],
  });
  // Closed already awaits nobody, so there is no obligation to suppress.
  assert.equal(result.awaiting, 'nobody');
});

test('a pending invitee that asked before accepting is waiting on a human, not on itself', () => {
  const result = deriveContractTurnState({
    contract: { ...ACTIVE, status: 'proposed' },
    viewerAgentId: ACCEPTER,
    participants: [BOTH[0]!, { ...BOTH[1]!, status: 'pending' }],
    lastMessage: null,
    blockingQuestions: [{ asked_by_agent_id: ACCEPTER, kind: 'blocked' }],
  });
  assert.equal(result.awaiting, 'human');
});

test('no blocking questions leaves every existing answer untouched', () => {
  const withEmpty = deriveContractTurnState({
    contract: ACTIVE, viewerAgentId: ACCEPTER, participants: BOTH,
    lastMessage: lastFrom(PROPOSER), blockingQuestions: [],
  });
  const withNone = deriveContractTurnState({
    contract: ACTIVE, viewerAgentId: ACCEPTER, participants: BOTH,
    lastMessage: lastFrom(PROPOSER),
  });
  assert.deepEqual(withEmpty, withNone);
  assert.equal(withNone.awaiting, 'you');
});

test('a blocking question is reported even when no agent owed a move', () => {
  // After an informational message nobody owes a turn. An agent that then says
  // it is blocked leaves a PERSON on the hook, and "nothing owed" hides that.
  const informational = {
    sender_id: PROPOSER,
    message_type: 'update',
    requires_action: false,
    consumes_turn: true,
    created_at: '2026-09-18T10:00:00Z',
  };
  const quiet = deriveContractTurnState({
    contract: ACTIVE, viewerAgentId: ACCEPTER, participants: BOTH, lastMessage: informational,
  });
  assert.equal(quiet.awaiting, 'nobody');

  const asked = deriveContractTurnState({
    contract: ACTIVE, viewerAgentId: ACCEPTER, participants: BOTH, lastMessage: informational,
    blockingQuestions: [{ asked_by_agent_id: ACCEPTER, kind: 'blocked' }],
  });
  assert.equal(asked.awaiting, 'human');
  assert.match(asked.reason, /You said you are blocked/);
});

test('the peer is still named when it is the peer that is stuck and nobody owes a turn', () => {
  const informational = {
    sender_id: PROPOSER,
    message_type: 'update',
    requires_action: false,
    consumes_turn: true,
    created_at: '2026-09-18T10:00:00Z',
  };
  const result = deriveContractTurnState({
    contract: ACTIVE, viewerAgentId: PROPOSER, participants: BOTH, lastMessage: informational,
    blockingQuestions: [{ asked_by_agent_id: ACCEPTER, kind: 'blocked' }],
  });
  assert.equal(result.awaiting, 'human');
  assert.match(result.reason, /clawclaw is waiting on a human/);
});

test('a question on a cancelled contract cannot make it live again', () => {
  for (const status of ['closed', 'expired', 'cancelled', 'rejected'] as const) {
    const result = deriveContractTurnState({
      contract: { ...ACTIVE, status },
      viewerAgentId: ACCEPTER,
      participants: BOTH,
      lastMessage: null,
      blockingQuestions: [{ asked_by_agent_id: ACCEPTER, kind: 'blocked' }],
    });
    assert.equal(result.awaiting, 'nobody', `${status} should owe nothing`);
  }
});

/**
 * `blockingQuestions` is optional, and an omitted one defaults to no questions
 * rather than failing - so a surface that forgets it derives a confident wrong
 * answer and nothing anywhere errors. The contracts LIST page shipped in
 * exactly that state: it fetched the operator channel for its "asking" pill but
 * never fed it to the derivation, so `awaiting: 'human'` could not occur there
 * and a contract parked on an unanswered question still read "your move" - on
 * the one page whose job is to say whose move it is.
 *
 * Every case above passes the argument by hand, so none of them could catch
 * that. This one reads the call sites.
 */
const SRC = join(process.cwd(), 'src');

/**
 * Activation asks a narrower question than any display does - who opens, by the
 * accepter-opens convention - and reads only `awaiting_agent_id`. A blocking
 * question nulls that field by design, which would leave the webhook naming
 * nobody as the opener, so this one call deliberately derives without them.
 */
const DELIBERATELY_UNCONDITIONED: Record<string, string> = {
  'app/api/v1/contracts/[id]/accept/route.ts': 'names the opener at activation; reads awaiting_agent_id only',
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path);
  }
  return out;
}

/** The argument object of each `deriveContractTurnState({ ... })` call. */
function callArguments(source: string): string[] {
  const out: string[] = [];
  const marker = 'deriveContractTurnState({';
  for (let at = source.indexOf(marker); at !== -1; at = source.indexOf(marker, at + 1)) {
    let depth = 0;
    let end = at + marker.length - 1;
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1;
      else if (source[end] === '}' && (depth -= 1) === 0) break;
    }
    out.push(source.slice(at, end + 1));
  }
  return out;
}

test('every surface that derives turn state feeds it the blocking questions', () => {
  const missing: string[] = [];
  let callSites = 0;

  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    if (!source.includes('deriveContractTurnState({')) continue;
    for (const call of callArguments(source)) {
      callSites += 1;
      const relative = file.slice(SRC.length + 1);
      if (call.includes('blockingQuestions') || relative in DELIBERATELY_UNCONDITIONED) continue;
      missing.push(relative);
    }
  }

  // A guard that finds no call sites cannot fail for the right reason.
  assert.ok(callSites >= 3, `expected at least the list page, the detail page and the API; found ${callSites}`);
  assert.deepEqual(missing, [], `these derive turn state without blocking questions: ${missing.join(', ')}`);
});
