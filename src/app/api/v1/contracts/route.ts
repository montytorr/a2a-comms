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
import { autoCloseIfExpired, enrichContract, getLastMessages } from './_helpers';
import { deliverWebhooks } from '@/lib/webhooks';
import { sendContractInvitationEmail } from '@/lib/email';
import { getUserEmail } from '@/lib/email/helpers';
import { createContractProposal, ContractProposalError } from '@/lib/contract-proposals';
import { checkLinkPermission, linkContractToTask, validateLinkFields } from '@/lib/contract-task-link';
import { getRelatedContractsForContracts } from '@/lib/contract-links';

export async function GET(req: NextRequest) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const role = url.searchParams.get('role');
  // `awaiting=me` answers the question the platform could not: what am I
  // holding? Without it the only inbox was for invitations, so an active
  // contract where you owed a reply appeared on no list anywhere.
  const awaiting = url.searchParams.get('awaiting');
  if (awaiting && !['me', 'peer', 'nobody'].includes(awaiting)) {
    // An empty 200 for a typo'd filter reads as "nothing is waiting on you",
    // which is the most misleading answer this endpoint can give.
    return NextResponse.json(
      {
        error: `awaiting must be one of: me, peer, nobody. Got "${awaiting}".`,
        code: 'VALIDATION_ERROR',
      } satisfies ApiError,
      { status: 400 }
    );
  }
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

  // Auto-close expired contracts and enrich with participants. Links and last
  // messages for the whole page come back in one query each, not one per row.
  const pageIds = (contracts || []).map((contract) => contract.id);
  const [relatedByContract, lastMessages] = await Promise.all([
    getRelatedContractsForContracts(pageIds),
    getLastMessages(pageIds),
  ]);
  const enriched: ContractResponse[] = [];
  for (const contract of contracts || []) {
    const c = await autoCloseIfExpired(contract);
    enriched.push(
      await enrichContract(c, {
        relatedContracts: relatedByContract.get(c.id) || [],
        viewerAgentId: auth.agent.id,
        lastMessage: lastMessages.get(c.id) ?? null,
        lastMessageResolved: true,
      })
    );
  }

  // Filtering after enrichment, because whose move it is has to be derived
  // before it can be filtered on. The page is already bounded.
  const visible = awaiting
    ? enriched.filter((contract) => contract.turn_state?.awaiting === (awaiting === 'me' ? 'you' : awaiting))
    : enriched;

  return NextResponse.json({
    data: visible,
    total: awaiting ? visible.length : count || 0,
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

  // Optional: link the contract to a project task in the same call. Validated
  // up front — if the agent cannot link, we refuse before creating anything
  // rather than leaving an unlinked contract behind for them to clean up.
  const wantsLink = Boolean(parsed.project_id || parsed.task_id);
  const pairingError = validateLinkFields(parsed.project_id, parsed.task_id);
  if (pairingError) {
    return NextResponse.json(
      { error: pairingError, code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }
  if (wantsLink) {
    const refusal = await checkLinkPermission(
      { projectId: parsed.project_id!, taskId: parsed.task_id! },
      auth.agent.id
    );
    if (refusal) return NextResponse.json(refusal.body, { status: refusal.status });
  }

  try {
    const proposal = await createContractProposal({
      actor: auth.agent,
      request: parsed,
      ipAddress: getClientIp(req),
      auditActor: auth.agent.name,
    });

    if (wantsLink) {
      const linkFailure = await linkContractToTask(proposal.contractId, parsed.task_id!);
      if (linkFailure) {
        return NextResponse.json(linkFailure.body, { status: linkFailure.status });
      }
      await auditLog({
        actor: auth.agent.name,
        action: 'task.contract_link',
        resourceType: 'task',
        resourceId: parsed.task_id!,
        details: { contract_id: proposal.contractId, via: 'contract-create' },
        ipAddress: getClientIp(req),
      });
    }

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

    // Re-enrich when linked so the response already carries linked_task; the
    // proposal was built before the link row existed.
    const responseBody = wantsLink
      ? await enrichContract(proposal.contract, { viewerAgentId: auth.agent.id })
      : proposal.contract;

    await storeIdempotencyResponse(idempotency.key, auth, 'POST /v1/contracts', 201, responseBody);
    return NextResponse.json(responseBody, { status: 201 });
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
