import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { checkIdempotency, storeIdempotencyResponse } from '@/lib/idempotency';
import { createServerClient } from '@/lib/db/server';
import type {
  SendMessageRequest,
  MessageResponse,
  PaginatedResponse,
  ApiError,
  Contract,
  MessageType,
} from '@/lib/types';
import { consumesTurn } from '@/lib/types';
import { autoCloseIfExpired, getParticipant } from '../../_helpers';
import { deliverWebhooks } from '@/lib/webhooks';
import { emitContractClosed } from '@/lib/contract-closure';
import { budgetExhaustedNextSteps } from '@/lib/contract-succession';
import { validateContent } from '@/lib/schema-validator';
import { validateMessageStructure } from '@/lib/message-structure';
import {
  extractSignals,
  resolvePrimaryAttention,
  resolveRequiresAction,
  validateReceiptContent,
  validateCompletionApprovalContent,
} from '@/lib/contract-message-notifications';
import { evaluateContractParticipantMutation } from '@/lib/contract-trust-policy';

const VALID_MESSAGE_TYPES: MessageType[] = ['message', 'request', 'response', 'update', 'status', 'receipt', 'approval'];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id } = await params;

  // Verify agent is a participant
  const participant = await getParticipant(id, auth.agent.id);
  if (!participant) {
    return NextResponse.json(
      { error: 'Contract not found or you are not a participant', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || url.searchParams.get('per_page') || '20', 10)));

  const db = createServerClient();

  // Auto-close if expired (side effect on contract)
  const { data: contract } = await db.from('contracts').select('*').eq('id', id).single();
  if (contract) await autoCloseIfExpired(contract as Contract);

  // Fetch messages
  const { data: messages, count, error } = await db
    .from('messages')
    .select('*', { count: 'exact' })
    .eq('contract_id', id)
    .order('created_at', { ascending: true })
    .range((page - 1) * perPage, page * perPage - 1);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch messages', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  // Fetch contract for turn info
  const maxTurns = contract?.max_turns ?? 50;
  const currentTurns = contract?.current_turns ?? 0;

  // Get sender info for all messages
  const senderIds = [...new Set((messages || []).map((m) => m.sender_id))];
  const { data: senders } = await db
    .from('agents')
    .select('id, name, display_name')
    .in('id', senderIds);

  const senderMap = new Map((senders || []).map((s) => [s.id, s]));

  // The turn number is the one the database recorded when the message was
  // written, not the row's position. Those agree only while every message
  // spends a turn: a receipt carries the standing turn rather than incrementing
  // it, so from the first receipt onward a positional index reports a turn that
  // was never taken - and disagrees with the POST response for the same message.
  // Position is kept only as a fallback for any row written before the column.
  const offset = (page - 1) * perPage;
  const enriched: MessageResponse[] = (messages || []).map((m, i) => ({
    ...m,
    sender: senderMap.get(m.sender_id) || { id: m.sender_id, name: 'unknown', display_name: 'Unknown' },
    turn_number: m.turn_number ?? offset + i + 1,
    turns_remaining: Math.max(0, maxTurns - currentTurns),
  }));

  return NextResponse.json({
    data: enriched,
    total: count || 0,
    page,
    per_page: perPage,
    limit: perPage,
  } satisfies PaginatedResponse<MessageResponse>);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id } = await params;

  // Idempotency check
  const endpoint = `POST /v1/contracts/${id}/messages`;
  const idempotency = await checkIdempotency(req, auth, endpoint);
  if (idempotency.cachedResponse) return idempotency.cachedResponse;

  // Rate limit messages
  const limit = await checkRateLimit(`messages:${auth.agent.id}`, RATE_LIMITS.messages);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Message rate limit exceeded (100/hour)', code: 'RATE_LIMITED' } satisfies ApiError,
      { status: 429 }
    );
  }

  // Verify agent is a participant
  const participant = await getParticipant(id, auth.agent.id);
  if (!participant) {
    return NextResponse.json(
      { error: 'Contract not found or you are not a participant', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  const db = createServerClient();

  // Fetch and validate contract status
  const { data: contract } = await db
    .from('contracts')
    .select('*')
    .eq('id', id)
    .single();

  if (!contract) {
    return NextResponse.json(
      { error: 'Contract not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  const checked = await autoCloseIfExpired(contract as Contract);
  if (checked.status !== 'active') {
    return NextResponse.json(
      { error: `Contract is ${checked.status}, can only send messages to active contracts`, code: 'INVALID_STATE' } satisfies ApiError,
      { status: 409 }
    );
  }

  const policy = evaluateContractParticipantMutation('send-message', participant);
  if (!policy.allowed) {
    return NextResponse.json(policy.body satisfies ApiError, { status: policy.status });
  }

  let parsed: SendMessageRequest;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (!parsed.content || typeof parsed.content !== 'object' || Array.isArray(parsed.content)) {
    return NextResponse.json(
      { error: 'Missing required field: content (must be an object)', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  // Reject empty or meaningless content
  const contentKeys = Object.keys(parsed.content);
  const meaningfulKeys = contentKeys.filter(k => {
    const val = parsed.content[k];
    if (val === null || val === undefined || val === '') return false;
    if (typeof val === 'string' && val.trim() === '') return false;
    return true;
  });
  // Must have at least one meaningful key beyond just 'from' and 'type'
  const substantiveKeys = meaningfulKeys.filter(k => k !== 'from' && k !== 'type');
  if (substantiveKeys.length === 0) {
    return NextResponse.json(
      { error: 'Message content is empty — must include substantive data beyond just "from" and "type"', code: 'EMPTY_MESSAGE' } satisfies ApiError,
      { status: 400 }
    );
  }

  const messageType = parsed.message_type || 'message';
  if (!VALID_MESSAGE_TYPES.includes(messageType)) {
    return NextResponse.json(
      { error: `Invalid message_type. Must be one of: ${VALID_MESSAGE_TYPES.join(', ')}`, code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const isNonTurn = !consumesTurn(messageType);
  // Bookkeeping never demands follow-up; a request always does; anything else
  // does unless the sender says otherwise. Old clients omit the field and keep
  // today's behaviour.
  const requiresAction = resolveRequiresAction(messageType, parsed.requires_action);

  // A control message that does not say what it controls is just a free way to
  // waste everyone's attention.
  const controlError =
    messageType === 'receipt'
      ? validateReceiptContent(parsed.content)
      : messageType === 'approval'
        ? validateCompletionApprovalContent(parsed.content)
        : null;
  if (controlError) {
    return NextResponse.json(
      { error: controlError, code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  // Checked before the turn cap so a refused message never costs a turn.
  // Receipts and approvals carry short control notes, not prose.
  if (!isNonTurn) {
    const structure = validateMessageStructure(parsed.content);
    if (!structure.ok) return NextResponse.json(structure.body satisfies ApiError, { status: structure.status });
  }

  // The turn cap bounds the conversation, not the bookkeeping about it. A
  // contract held open for an approval that has not arrived must still be able
  // to receive that approval, and a receipt is never worth a turn.
  if (!isNonTurn && checked.current_turns >= checked.max_turns) {
    return NextResponse.json(
      { error: 'Max turns reached', code: 'MAX_TURNS' } satisfies ApiError,
      { status: 409 }
    );
  }

  // Only the proposer can satisfy a completion gate. The database re-checks
  // this against proposer_id; this is the friendlier error.
  const approvesCompletion = messageType === 'approval';
  if (approvesCompletion && auth.agent.id !== checked.proposer_id) {
    return NextResponse.json(
      { error: 'Only the contract proposer can approve completion', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  // Validate content against contract schema (if defined). Receipts and
  // approvals are protocol control messages with their own shape, so a
  // contract's payload schema must not reject them.
  if (checked.message_schema && !isNonTurn) {
    const validation = validateContent(checked.message_schema, parsed.content);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error, code: 'SCHEMA_VALIDATION_ERROR', details: validation.issues } satisfies ApiError,
        { status: 400 }
      );
    }
  }

  // Atomic: insert message + increment turns + auto-close in one transaction (SELECT FOR UPDATE)
  const { data: rpcResult, error: rpcErr } = await db.rpc('insert_message_atomic', {
    p_contract_id: id,
    p_sender_id: auth.agent.id,
    p_message_type: messageType,
    p_content: parsed.content,
    p_approves_completion: approvesCompletion,
    // Persisted on the row, so turn accounting can be audited later rather
    // than only observed as it happens.
    p_requires_action: requiresAction,
  });

  if (rpcErr) {
    return NextResponse.json(
      { error: 'Failed to send message', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  // Handle RPC-level errors (contract not found, invalid state, max turns)
  if (rpcResult.error) {
    const codeMap: Record<string, number> = {
      CONTRACT_NOT_FOUND: 404,
      INVALID_STATE: 409,
      MAX_TURNS: 409,
      FORBIDDEN: 403,
    };
    return NextResponse.json(
      { error: rpcResult.message, code: rpcResult.error } satisfies ApiError,
      { status: codeMap[rpcResult.error] || 500 }
    );
  }

  const newTurns: number = rpcResult.new_turns;
  const maxTurnsContract: number = rpcResult.max_turns;
  const messageId: string = rpcResult.message_id;
  const messageCreatedAt: string = rpcResult.message_created_at;

  // Deliver webhook notifications to all OTHER participants (fire-and-forget)
  const { data: allParticipants } = await db
    .from('contract_participants')
    .select('agent_id')
    .eq('contract_id', id)
    .neq('agent_id', auth.agent.id);
  const recipientIds = (allParticipants || []).map(p => p.agent_id);
  const turnsRemaining = Math.max(0, maxTurnsContract - newTurns);

  // One message, one delivery. Async signals used to be delivered as extra
  // webhooks on top of this one, so a single message woke the recipient several
  // times and each wake looked like new work to answer.
  const signals = extractSignals(parsed.content);
  const attention = resolvePrimaryAttention(messageType, signals, requiresAction);

  deliverWebhooks(recipientIds, {
    event: 'message',
    contract_id: id,
    data: {
      // message_id lets a recipient recognise redelivery of the same logical
      // message rather than deduplicating on the delivery attempt.
      message_id: messageId,
      sender: auth.agent.name,
      message_type: messageType,
      turn: newTurns,
      turns_remaining: turnsRemaining,
      max_turns: maxTurnsContract,
      consumes_turn: rpcResult.consumes_turn ?? !isNonTurn,
      requires_action: rpcResult.requires_action ?? requiresAction,
      turn_number: rpcResult.turn_number ?? newTurns,
      attention,
      attention_signals: signals,
      async_completion: signals.includes('completed'),
      awaiting_completion_approval: rpcResult.awaiting_completion_approval === true,
    },
    timestamp: new Date().toISOString(),
  }).catch(() => {}); // fire-and-forget

  // insert_message_atomic can close the contract as a side effect - the turn
  // budget running out, or an approval arriving once it already had. Both
  // happened inside SQL and emitted nothing, so the most common way for a
  // contract to end was also the only way nobody heard about it.
  const closedByMaxTurns = rpcResult.max_reached === true
    && rpcResult.awaiting_completion_approval !== true
    && !isNonTurn;
  const closedByApproval = rpcResult.completed === true;
  if (closedByMaxTurns || closedByApproval) {
    emitContractClosed({
      contractId: id,
      status: 'closed',
      closedBy: closedByApproval ? 'system:completion-approved' : 'system:max-turns',
      closedByKind: 'system',
      reason: closedByApproval ? 'Completed with proposer approval' : 'Max turns reached',
      currentTurns: newTurns,
      maxTurns: maxTurnsContract,
      completionApprovedAt: rpcResult.completion_approved_at ?? null,
    }).catch(() => {});
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'message.send',
    resourceType: 'message',
    resourceId: messageId,
    details: {
      contract_id: id,
      message_type: messageType,
      turn: newTurns,
    },
    ipAddress: getClientIp(req),
  });

  const response: MessageResponse = {
    id: messageId,
    contract_id: id,
    sender_id: auth.agent.id,
    message_type: messageType,
    content: parsed.content,
    created_at: messageCreatedAt,
    sender: {
      id: auth.agent.id,
      name: auth.agent.name,
      display_name: auth.agent.display_name,
    },
    turn_number: newTurns,
    turns_remaining: Math.max(0, maxTurnsContract - newTurns),
    consumes_turn: rpcResult.consumes_turn ?? !isNonTurn,
    requires_action: rpcResult.requires_action ?? requiresAction,
    completion_approved_at: rpcResult.completion_approved_at ?? null,
  };

  // The header alone told a client the budget was gone and nothing about what
  // to do; a gated contract then sat active with nobody prompted to decide.
  if (turnsRemaining === 0) {
    const approvedAt = rpcResult.completion_approved_at ?? checked.completion_approved_at;
    response.budget_exhausted = true;
    response.next_steps = budgetExhaustedNextSteps({
      contractId: id,
      isProposer: auth.agent.id === checked.proposer_id,
      gatePending: checked.completion_requires_approval && !approvedAt,
      completed: closedByApproval || (closedByMaxTurns && !!approvedAt),
    });
  }

  await storeIdempotencyResponse(idempotency.key, auth, `POST /v1/contracts/${id}/messages`, 201, response);

  // Warn when turns are running low (≤3 remaining)
  const headers: Record<string, string> = {};
  if (turnsRemaining <= 3) {
    headers['X-Turns-Warning'] = `Only ${turnsRemaining} turn(s) remaining on this contract`;
  }
  if (turnsRemaining === 0) {
    headers['X-Contract-Status'] = 'exhausted';
  }

  const jsonResponse = NextResponse.json(response, { status: 201 });
  for (const [key, value] of Object.entries(headers)) {
    jsonResponse.headers.set(key, value);
  }
  return jsonResponse;
}
