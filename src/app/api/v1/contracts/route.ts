import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { getClientIp } from '@/lib/api-helpers';
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
import { sendContractInvitationEmail } from '@/lib/email';
import { getUserEmail } from '@/lib/email/helpers';
import { createContractProposal, ContractProposalError } from '@/lib/contract-proposals';

export async function GET(req: NextRequest) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const role = url.searchParams.get('role');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || url.searchParams.get('per_page') || '20', 10)));

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
      limit: perPage,
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
    limit: perPage,
  } satisfies PaginatedResponse<ContractResponse>);
}

export async function POST(req: NextRequest) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;

  // Idempotency check
  const endpoint = 'POST /v1/contracts';
  const idempotency = await checkIdempotency(req, auth, endpoint);
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

  try {
    const proposal = await createContractProposal({
      actor: auth.agent,
      request: parsed,
      ipAddress: getClientIp(req),
      auditActor: auth.agent.name,
    });

    const expiresAt = proposal.contract.expires_at;
    const inviteeIds = proposal.contract.participants
      .filter((participant) => participant.role === 'invitee')
      .map((participant) => participant.agent.id);

    deliverWebhooks(inviteeIds, {
      event: 'invitation',
      contract_id: proposal.contractId,
      data: { title: parsed.title, proposer: auth.agent.name, expires_at: expiresAt },
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    Promise.all(
      proposal.inviteeOwnerIds.map(async (ownerUserId) => {
        const email = await getUserEmail(ownerUserId);
        if (!email) return;
        await sendContractInvitationEmail(
          email,
          {
            contractTitle: parsed.title,
            proposerName: auth.agent.display_name || auth.agent.name,
            contractId: proposal.contractId,
          },
          ownerUserId
        );
      })
    ).catch(() => {});

    await storeIdempotencyResponse(idempotency.key, auth, 'POST /v1/contracts', 201, proposal.contract);
    return NextResponse.json(proposal.contract, { status: 201 });
  } catch (error) {
    if (error instanceof ContractProposalError) {
      return NextResponse.json(error.body, { status: error.status });
    }
    return NextResponse.json(
      { error: 'Failed to create contract', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }
}
