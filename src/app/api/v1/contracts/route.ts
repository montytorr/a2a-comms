import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { checkIdempotency, storeIdempotencyResponse } from '@/lib/idempotency';
import { createServerClient } from '@/lib/supabase/server';
import type {
  ProposeContractRequest,
  ContractResponse,
  PaginatedResponse,
  ApiError,
} from '@/lib/types';
import { autoCloseIfExpired, enrichContract } from './_helpers';
import { deliverWebhooks } from '@/lib/webhooks';

export async function GET(req: NextRequest) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const role = url.searchParams.get('role');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') || '20', 10)));

  const supabase = createServerClient();

  // Get contract IDs where this agent is a participant
  let participantQuery = supabase
    .from('contract_participants')
    .select('contract_id')
    .eq('agent_id', auth.agent.id);

  if (role === 'proposer' || role === 'invitee') {
    participantQuery = participantQuery.eq('role', role);
  }

  const { data: participantRows, error: partErr } = await participantQuery;

  if (partErr) {
    return NextResponse.json(
      { error: 'Failed to fetch contracts', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  const contractIds = (participantRows || []).map((r) => r.contract_id);

  if (contractIds.length === 0) {
    return NextResponse.json({
      data: [],
      total: 0,
      page,
      per_page: perPage,
    } satisfies PaginatedResponse<ContractResponse>);
  }

  // Build contracts query
  let contractsQuery = supabase
    .from('contracts')
    .select('*', { count: 'exact' })
    .in('id', contractIds);

  if (status) {
    contractsQuery = contractsQuery.eq('status', status);
  }

  contractsQuery = contractsQuery
    .order('created_at', { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  const { data: contracts, count, error: contractsErr } = await contractsQuery;

  if (contractsErr) {
    return NextResponse.json(
      { error: 'Failed to fetch contracts', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  // Auto-close expired contracts and enrich with participants
  const enriched: ContractResponse[] = [];
  for (const contract of contracts || []) {
    const c = await autoCloseIfExpired(contract);
    enriched.push(await enrichContract(c));
  }

  return NextResponse.json({
    data: enriched,
    total: count || 0,
    page,
    per_page: perPage,
  } satisfies PaginatedResponse<ContractResponse>);
}

export async function POST(req: NextRequest) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;

  // Idempotency check
  const idempotency = await checkIdempotency(req, auth);
  if (idempotency.cachedResponse) return idempotency.cachedResponse;

  // Rate limit proposals
  const limit = await checkRateLimit(`proposals:${auth.agent.id}`, RATE_LIMITS.proposals);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Proposal rate limit exceeded (10/hour)', code: 'RATE_LIMITED' } satisfies ApiError,
      { status: 429 }
    );
  }

  let parsed: ProposeContractRequest;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (!parsed.title || !Array.isArray(parsed.invitees) || parsed.invitees.length === 0) {
    return NextResponse.json(
      { error: 'Missing required fields: title, invitees (non-empty array)', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const maxTurns = parsed.max_turns ?? 50;
  const expiresInHours = parsed.expires_in_hours ?? 168;
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  const supabase = createServerClient();

  // Validate all invitees exist
  const { data: inviteeAgents, error: invErr } = await supabase
    .from('agents')
    .select('id, name, display_name, max_concurrent_contracts')
    .in('name', parsed.invitees);

  if (invErr) {
    return NextResponse.json(
      { error: 'Failed to validate invitees', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  const foundNames = new Set((inviteeAgents || []).map((a) => a.name));
  const missing = parsed.invitees.filter((n) => !foundNames.has(n));
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Unknown invitee(s): ${missing.join(', ')}`, code: 'INVALID_INVITEES' } satisfies ApiError,
      { status: 400 }
    );
  }

  // Prevent inviting yourself
  if (parsed.invitees.includes(auth.agent.name)) {
    return NextResponse.json(
      { error: 'Cannot invite yourself to a contract', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  // Enforce max_concurrent_contracts for proposer
  {
    const { data: activeContracts } = await supabase
      .from('contracts')
      .select('id')
      .in('status', ['active', 'proposed'])
      .in('id', (await supabase
        .from('contract_participants')
        .select('contract_id')
        .eq('agent_id', auth.agent.id))
        .data?.map(r => r.contract_id) || []);

    const currentActive = activeContracts?.length || 0;
    if (auth.agent.max_concurrent_contracts && currentActive >= auth.agent.max_concurrent_contracts) {
      return NextResponse.json(
        { error: `Proposer ${auth.agent.name} has reached max concurrent active contracts (${auth.agent.max_concurrent_contracts})`, code: 'MAX_CONTRACTS_REACHED' } satisfies ApiError,
        { status: 409 }
      );
    }
  }

  // Enforce max_concurrent_contracts for each invitee
  for (const invitee of inviteeAgents || []) {
    if (!invitee.max_concurrent_contracts) continue;
    const { data: inviteeContracts } = await supabase
      .from('contracts')
      .select('id')
      .in('status', ['active', 'proposed'])
      .in('id', (await supabase
        .from('contract_participants')
        .select('contract_id')
        .eq('agent_id', invitee.id))
        .data?.map(r => r.contract_id) || []);

    if ((inviteeContracts?.length || 0) >= invitee.max_concurrent_contracts) {
      return NextResponse.json(
        { error: `Invitee ${invitee.name} has reached max concurrent active contracts (${invitee.max_concurrent_contracts})`, code: 'MAX_CONTRACTS_REACHED' } satisfies ApiError,
        { status: 409 }
      );
    }
  }

  // Create contract
  const { data: contract, error: contractErr } = await supabase
    .from('contracts')
    .insert({
      title: parsed.title,
      description: parsed.description || null,
      status: 'proposed',
      proposer_id: auth.agent.id,
      max_turns: maxTurns,
      current_turns: 0,
      expires_at: expiresAt,
      message_schema: parsed.message_schema || null,
    })
    .select()
    .single();

  if (contractErr || !contract) {
    return NextResponse.json(
      { error: 'Failed to create contract', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  // Add proposer as participant (auto-accepted)
  const participants = [
    {
      contract_id: contract.id,
      agent_id: auth.agent.id,
      role: 'proposer' as const,
      status: 'accepted' as const,
      responded_at: new Date().toISOString(),
    },
    ...(inviteeAgents || []).map((a) => ({
      contract_id: contract.id,
      agent_id: a.id,
      role: 'invitee' as const,
      status: 'pending' as const,
      responded_at: null,
    })),
  ];

  const { error: partInsertErr } = await supabase
    .from('contract_participants')
    .insert(participants);

  if (partInsertErr) {
    // Attempt cleanup
    await supabase.from('contracts').delete().eq('id', contract.id);
    return NextResponse.json(
      { error: 'Failed to create participants', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'contract.propose',
    resourceType: 'contract',
    resourceId: contract.id,
    details: {
      title: parsed.title,
      invitees: parsed.invitees,
      max_turns: maxTurns,
      expires_in_hours: expiresInHours,
    },
    ipAddress: getClientIp(req),
  });

  // Deliver webhook notifications to invitees (fire-and-forget)
  const inviteeIds = (inviteeAgents || []).map(a => a.id);
  deliverWebhooks(inviteeIds, {
    event: 'invitation',
    contract_id: contract.id,
    data: { title: parsed.title, proposer: auth.agent.name, expires_at: expiresAt },
    timestamp: new Date().toISOString(),
  }).catch(() => {}); // fire-and-forget

  // Return enriched response
  const enriched = await enrichContract(contract);

  await storeIdempotencyResponse(idempotency.key, auth, 'POST /v1/contracts', 201, enriched);

  return NextResponse.json(enriched, { status: 201 });
}
