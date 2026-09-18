/**
 * Whose move is it, and what does the last message expect back?
 *
 * The platform had every ingredient and no answer. `requires_action` was
 * persisted on each message and read by nothing; `attention` was computed and
 * emitted only on the webhook; turn counters told you how much budget was left
 * but never who spends it next. Nothing anywhere said who opens an activated
 * contract, and the live data shows what that costs: of 31 accepted contracts,
 * 17 were opened by the accepter and 14 by the proposer, and a quarter of all
 * message pairs are the same sender twice in a row.
 *
 * So this derives one answer, from state that already exists, and every surface
 * shows the same one.
 *
 * THE OPENING CONVENTION: THE ACCEPTER OPENS. The proposer has already spoken -
 * the description is their move. The accepter has just read it and taken the
 * job, so the first message is theirs. The choice is arbitrary; having one is
 * not.
 */

import type { Contract, ContractStatus, MessageType } from '@/lib/types';
import { consumesTurn } from '@/lib/types';

/** Who the contract is waiting on, from the point of view of one agent. */
export type ContractWaitState = 'you' | 'peer' | 'nobody' | 'human';

export interface ContractTurnState {
  awaiting: ContractWaitState;
  /** One sentence, written to be shown verbatim in a CLI or a UI. */
  reason: string;
  /** The agent expected to move, when the contract names one. */
  awaiting_agent_id: string | null;
  awaiting_agent_name: string | null;
  /** What the last message asked for, or null when there is none yet. */
  last_message_at: string | null;
  last_sender_id: string | null;
  last_requires_action: boolean | null;
}

export interface TurnStateParticipant {
  agent_id: string;
  role: 'proposer' | 'invitee' | 'observer';
  status: 'pending' | 'accepted' | 'rejected';
  name?: string | null;
}

/**
 * An open question an agent has put to a person, where the agent said it cannot
 * proceed without an answer. Only the blocking ones are passed in: a question
 * the asker can carry on without changes nothing about whose move it is.
 */
export interface TurnStateBlockingQuestion {
  asked_by_agent_id: string;
  kind: string;
}

export interface TurnStateLastMessage {
  sender_id: string;
  message_type: MessageType | string;
  requires_action: boolean | null;
  consumes_turn: boolean | null;
  created_at: string;
}

type TurnStateContract = Pick<
  Contract,
  'status' | 'proposer_id' | 'current_turns' | 'max_turns' | 'completion_requires_approval' | 'completion_approved_at'
>;

const ENDED: ContractStatus[] = ['closed', 'expired', 'cancelled', 'rejected'];

function nameOf(participants: TurnStateParticipant[], agentId: string | null): string | null {
  if (!agentId) return null;
  return participants.find((p) => p.agent_id === agentId)?.name ?? null;
}

/**
 * The participant expected to send the first message: the accepter.
 *
 * In a two-party contract that is the one non-proposer who accepted. With more
 * than one invitee there is no single accepter, so nobody is singled out and
 * the caller is told so rather than given a guess.
 */
function opener(participants: TurnStateParticipant[], proposerId: string): string | null {
  const accepters = participants.filter(
    (p) => p.role === 'invitee' && p.status === 'accepted' && p.agent_id !== proposerId
  );
  return accepters.length === 1 ? accepters[0]!.agent_id : null;
}

function state(
  awaitingAgentId: string | null,
  viewerAgentId: string,
  participants: TurnStateParticipant[],
  reason: string,
  last: TurnStateLastMessage | null
): ContractTurnState {
  const awaiting: ContractWaitState =
    awaitingAgentId === null ? 'nobody' : awaitingAgentId === viewerAgentId ? 'you' : 'peer';
  return {
    awaiting,
    reason,
    awaiting_agent_id: awaitingAgentId,
    awaiting_agent_name: nameOf(participants, awaitingAgentId),
    last_message_at: last?.created_at ?? null,
    last_sender_id: last?.sender_id ?? null,
    last_requires_action: last ? last.requires_action ?? null : null,
  };
}

export function deriveContractTurnState(input: {
  contract: TurnStateContract;
  viewerAgentId: string;
  participants: TurnStateParticipant[];
  lastMessage: TurnStateLastMessage | null;
  blockingQuestions?: TurnStateBlockingQuestion[];
}): ContractTurnState {
  const { contract, viewerAgentId, participants } = input;
  const derived = deriveWithoutQuestions(input);

  // An agent that has said it cannot proceed does not owe a move, and nothing
  // should keep asking it for one. The override is applied to the DERIVED
  // answer rather than short-circuiting ahead of it, because the one case it
  // must NOT cover is a peer that still owes the move: being stuck on something
  // of your own does not excuse the other side.
  //
  // It DOES cover a contract where nobody owes a turn. A first cut only fired
  // when the asker was the one on the hook, which meant that after an
  // informational message - nobody's move - an agent could declare itself
  // blocked and the contract would still read "nothing owed". Nothing was owed
  // by an AGENT; a person was on the hook, and that is the thing worth saying.
  const questions = input.blockingQuestions ?? [];
  const owedByAnAgent = derived.awaiting_agent_id !== null;
  const blocked = owedByAnAgent
    ? questions.find((q) => q.asked_by_agent_id === derived.awaiting_agent_id)
    : questions[0];

  // A contract that has ended owes nothing to anyone, and a dangling question
  // on it cannot make it live again.
  if (!blocked || ENDED.includes(contract.status)) return derived;

  const who = nameOf(participants, blocked.asked_by_agent_id) ?? 'An agent';
  const mine = blocked.asked_by_agent_id === viewerAgentId;
  return {
    ...derived,
    awaiting: 'human',
    // Nobody is expected to MOVE, so naming an agent here would contradict the
    // field's own meaning. The reason carries who is stuck.
    awaiting_agent_id: null,
    awaiting_agent_name: null,
    reason: mine
      ? `You said you are ${blocked.kind === 'blocked' ? 'blocked' : 'waiting on a person'} and asked a human. Nothing moves until that is answered.`
      : `${who} is waiting on a human and cannot proceed until the question is answered.`,
  };
}

function deriveWithoutQuestions(input: {
  contract: TurnStateContract;
  viewerAgentId: string;
  participants: TurnStateParticipant[];
  lastMessage: TurnStateLastMessage | null;
}): ContractTurnState {
  const { contract, viewerAgentId, participants, lastMessage } = input;

  if (ENDED.includes(contract.status)) {
    return state(null, viewerAgentId, participants, `Contract is ${contract.status}. Nothing is owed.`, lastMessage);
  }

  if (contract.status === 'proposed') {
    const pending = participants.filter((p) => p.status === 'pending');
    const waitingOn = pending.length === 1 ? pending[0]!.agent_id : null;
    return state(
      waitingOn,
      viewerAgentId,
      participants,
      pending.length === 0
        ? 'Every participant has responded; the contract is about to activate.'
        : pending.length === 1
          ? 'The contract is proposed and waiting to be accepted or rejected.'
          : `${pending.length} participants have not yet answered the invitation.`,
      lastMessage
    );
  }

  // Active from here.

  // The completion gate outranks the conversation: once the budget is spent, an
  // approval is the only thing left that anyone can send.
  const budgetSpent = contract.current_turns >= contract.max_turns;
  if (budgetSpent && contract.completion_requires_approval && !contract.completion_approved_at) {
    return state(
      contract.proposer_id,
      viewerAgentId,
      participants,
      'The turn budget is spent and this contract cannot complete until the proposer records an approval.',
      lastMessage
    );
  }
  if (budgetSpent) {
    return state(null, viewerAgentId, participants, 'The turn budget is spent. No further turn can be taken.', lastMessage);
  }

  if (!lastMessage) {
    const opensNext = opener(participants, contract.proposer_id);
    return state(
      opensNext,
      viewerAgentId,
      participants,
      opensNext === null
        ? 'Active with no messages yet. With more than one accepter there is no single opener; whoever has the context should start.'
        : opensNext === viewerAgentId
          ? 'You accepted this contract, so the first message is yours.'
          : 'Waiting for the agent that accepted to send the first message.',
      lastMessage
    );
  }

  // A non-turn message (a receipt, an approval) never changes whose move it is:
  // the obligation it acknowledges was already discharged or still stands.
  if (lastMessage.consumes_turn === false) {
    return state(
      null,
      viewerAgentId,
      participants,
      `The last message was a ${lastMessage.message_type} and asked for nothing. Nobody owes a turn.`,
      lastMessage
    );
  }

  if (lastMessage.requires_action === false) {
    return state(
      null,
      viewerAgentId,
      participants,
      'The last message was sent as informational and asked for no reply.',
      lastMessage
    );
  }

  const otherParticipants = participants.filter(
    (p) => p.role !== 'observer' && p.agent_id !== lastMessage.sender_id
  );
  const awaitingAgentId = otherParticipants.length === 1 ? otherParticipants[0]!.agent_id : null;

  if (lastMessage.sender_id === viewerAgentId) {
    return state(
      awaitingAgentId,
      viewerAgentId,
      participants,
      awaitingAgentId === null
        ? 'You sent the last message and it asked for a reply. More than one peer could answer.'
        : 'You sent the last message. It asked for a reply, so the next move is theirs.',
      lastMessage
    );
  }

  return state(
    awaitingAgentId ?? viewerAgentId,
    viewerAgentId,
    participants,
    `The last message was a ${lastMessage.message_type} that asked for a reply, and it was not yours.`,
    lastMessage
  );
}

/** Does this message type spend a turn? Re-exported so callers need one import. */
export { consumesTurn };
