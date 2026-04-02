import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { checkIdempotency, storeIdempotencyResponse } from '@/lib/idempotency';
import { createServerClient } from '@/lib/supabase/server';
import type {
  SendMessageRequest,
  MessageResponse,
  PaginatedResponse,
  ApiError,
  Contract,
  MessageType,
} from '@/lib/types';
import { autoCloseIfExpired, getParticipant } from '../../_helpers';
import { deliverWebhooks } from '@/lib/webhooks';
import { validateContent } from '@/lib/schema-validator';

const VALID_MESSAGE_TYPES: MessageType[] = ['message', 'request', 'response', 'update', 'status'];

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
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') || '20', 10)));

  const supabase = createServerClient();

  // Auto-close if expired (side effect on contract)
  const { data: contract } = await supabase.from('contracts').select('*').eq('id', id).single();
  if (contract) await autoCloseIfExpired(contract as Contract);

  // Fetch messages
  const { data: messages, count, error } = await supabase
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
  const { data: senders } = await supabase
    .from('agents')
    .select('id, name, display_name')
    .in('id', senderIds);

  const senderMap = new Map((senders || []).map((s) => [s.id, s]));

  // Build enriched message responses with turn numbers
  // Turn number = position in the full message sequence (1-indexed)
  // For paginated results, offset by (page - 1) * perPage
  const offset = (page - 1) * perPage;
  const enriched: MessageResponse[] = (messages || []).map((m, i) => ({
    ...m,
    sender: senderMap.get(m.sender_id) || { id: m.sender_id, name: 'unknown', display_name: 'Unknown' },
    turn_number: offset + i + 1,
    turns_remaining: Math.max(0, maxTurns - currentTurns),
  }));

  return NextResponse.json({
    data: enriched,
    total: count || 0,
    page,
    per_page: perPage,
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
  const idempotency = await checkIdempotency(req, auth);
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

  const supabase = createServerClient();

  // Fetch and validate contract status
  const { data: contract } = await supabase
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

  // Check max turns
  if (checked.current_turns >= checked.max_turns) {
    return NextResponse.json(
      { error: 'Max turns reached', code: 'MAX_TURNS' } satisfies ApiError,
      { status: 409 }
    );
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

  if (!parsed.content || typeof parsed.content !== 'object') {
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

  // Validate content against contract schema (if defined)
  if (checked.message_schema) {
    const validation = validateContent(checked.message_schema, parsed.content);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error, code: 'SCHEMA_VALIDATION_ERROR', details: 'Message content does not match the contract schema' } satisfies ApiError,
        { status: 400 }
      );
    }
  }

  // Insert message
  const { data: message, error: insertErr } = await supabase
    .from('messages')
    .insert({
      contract_id: id,
      sender_id: auth.agent.id,
      message_type: messageType,
      content: parsed.content,
    })
    .select()
    .single();

  if (insertErr || !message) {
    return NextResponse.json(
      { error: 'Failed to send message', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  // Increment current_turns
  const newTurns = checked.current_turns + 1;
  await supabase
    .from('contracts')
    .update({
      current_turns: newTurns,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  // Auto-close if max turns reached
  if (newTurns >= checked.max_turns) {
    await supabase
      .from('contracts')
      .update({
        status: 'closed',
        close_reason: 'Max turns reached',
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
  }

  // Deliver webhook notifications to all OTHER participants (fire-and-forget)
  const { data: allParticipants } = await supabase
    .from('contract_participants')
    .select('agent_id')
    .eq('contract_id', id)
    .neq('agent_id', auth.agent.id);
  const recipientIds = (allParticipants || []).map(p => p.agent_id);
  deliverWebhooks(recipientIds, {
    event: 'message',
    contract_id: id,
    data: {
      sender: auth.agent.name,
      message_type: messageType,
      turn: newTurns,
      turns_remaining: Math.max(0, checked.max_turns - newTurns),
      max_turns: checked.max_turns,
    },
    timestamp: new Date().toISOString(),
  }).catch(() => {}); // fire-and-forget

  await auditLog({
    actor: auth.agent.name,
    action: 'message.send',
    resourceType: 'message',
    resourceId: message.id,
    details: {
      contract_id: id,
      message_type: messageType,
      turn: newTurns,
    },
    ipAddress: getClientIp(req),
  });

  const response: MessageResponse = {
    ...message,
    sender: {
      id: auth.agent.id,
      name: auth.agent.name,
      display_name: auth.agent.display_name,
    },
    turn_number: newTurns,
    turns_remaining: Math.max(0, checked.max_turns - newTurns),
  };

  await storeIdempotencyResponse(idempotency.key, auth, `POST /v1/contracts/${id}/messages`, 201, response);

  // Warn when turns are running low (≤3 remaining)
  const turnsRemaining = Math.max(0, checked.max_turns - newTurns);
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
