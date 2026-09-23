import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { checkIdempotency, storeIdempotencyResponse } from '@/lib/idempotency';
import { createServerClient } from '@/lib/db/server';
import type {
  ProposeContractRequest,
  ContractResponse,
  PaginatedResponse,
  ProposeContractResponse,
  ApiError,
} from '@/lib/types';
import { autoCloseIfExpired, enrichContract, getLastMessages } from './_helpers';
import { deliverWebhooks } from '@/lib/webhooks';
import { sendContractInvitationEmail } from '@/lib/email';
import { getUserEmail } from '@/lib/email/helpers';
import { createContractProposal, ContractProposalError } from '@/lib/contract-proposals';
import { checkLinkPermission, getLinkedTask, linkContractToTask, validateLinkFields } from '@/lib/contract-task-link';
import {
  checkContractLinkPermission,
  createContractLink,
  getRelatedContractsForContracts,
} from '@/lib/contract-links';
import {
  buildInvitationData,
  findLikelyPredecessors,
  resolveTaskLinkPlan,
  successionHint,
  validateProposalSuccession,
} from '@/lib/contract-succession';
import { getOperatorChannelForContracts } from '@/lib/contract-operator-channel-server';

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
  if (awaiting && !['me', 'peer', 'nobody', 'human'].includes(awaiting)) {
    // An empty 200 for a typo'd filter reads as "nothing is waiting on you",
    // which is the most misleading answer this endpoint can give.
    return NextResponse.json(
      {
        error: `awaiting must be one of: me, peer, nobody, human. Got "${awaiting}".`,
        code: 'VALIDATION_ERROR',
      } satisfies ApiError,
      { status: 400 }
    );
  }
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || url.searchParams.get('per_page') || '20', 10)));

  const db = createServerClient();

  // Get contract IDs where this agent is a participant
  let participantQuery = db
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
  let contractsQuery = db
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
  const [relatedByContract, lastMessages, channels] = await Promise.all([
    getRelatedContractsForContracts(pageIds),
    getLastMessages(pageIds),
    getOperatorChannelForContracts(pageIds, auth.agent.id),
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
        channel: channels.get(c.id),
        // Counts only on a list. The bodies are on the contract itself.
        includeChannelBodies: false,
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

  // Succession and the task link are both settled before anything is written,
  // so a refusal never leaves a half-linked contract behind to clean up.
  const succession = validateProposalSuccession(parsed);
  if (!succession.ok) return NextResponse.json(succession.body, { status: succession.status });
  const { predecessor } = succession.value;

  // Optional: link the contract to a project task in the same call.
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

  // Same rule as the links route: asserting succession is a claim about the
  // earlier contract too, so the proposer must be a (non-observer) participant
  // in it. The new contract will have the proposer as its proposer.
  if (predecessor) {
    const refusal = await checkContractLinkPermission([predecessor.id], auth.agent.id);
    if (refusal) return NextResponse.json(refusal.body, { status: refusal.status });
  }

  const taskPlan = resolveTaskLinkPlan({
    hasTask: wantsLink,
    unlinkedReason: succession.value.unlinkedReason,
    predecessor,
    predecessorTask: !wantsLink && predecessor ? await getLinkedTask(predecessor.id) : null,
  });
  if (!taskPlan.ok) return NextResponse.json(taskPlan.body, { status: taskPlan.status });
  const plan = taskPlan.plan;
  const linkTaskId =
    plan.kind === 'task' ? parsed.task_id! : plan.kind === 'inherit' ? plan.task.task_id : null;

  try {
    const proposal = await createContractProposal({
      actor: auth.agent,
      request: { ...parsed, unlinked_reason: plan.kind === 'unlinked' ? plan.reason : undefined },
      ipAddress: getClientIp(req),
      auditActor: auth.agent.name,
    });

    if (linkTaskId) {
      const linkFailure = await linkContractToTask(proposal.contractId, linkTaskId);
      if (linkFailure) {
        return NextResponse.json(linkFailure.body, { status: linkFailure.status });
      }
      await auditLog({
        actor: auth.agent.name,
        action: 'task.contract_link',
        resourceType: 'task',
        resourceId: linkTaskId,
        details: {
          contract_id: proposal.contractId,
          via: plan.kind === 'inherit' ? 'contract-create-inherited' : 'contract-create',
          ...(plan.kind === 'inherit' ? { inherited_from_contract_id: predecessor?.id } : {}),
        },
        ipAddress: getClientIp(req),
      });
    }

    if (predecessor) {
      // Non-fatal, like the handoff path: undoing a created proposal over a
      // metadata row would be worse. A missing link shows in the response's
      // related_contracts, and `holloway contract-relate` can still record it.
      const linkFailure = await createContractLink({
        fromContractId: proposal.contractId,
        toContractId: predecessor.id,
        linkType: predecessor.linkType,
        createdByAgentId: auth.agent.id,
      }).catch(() => ({ status: 500, body: { error: 'Failed to link contracts', code: 'DB_ERROR' } }));
      if (!linkFailure) {
        await auditLog({
          actor: auth.agent.name,
          action: 'contract.linked',
          resourceType: 'contract',
          resourceId: proposal.contractId,
          details: { to_contract_id: predecessor.id, link_type: predecessor.linkType, via: 'contract-create' },
          ipAddress: getClientIp(req),
        });
      }
    }

    // Re-enrich when anything was linked so the response already carries
    // linked_task and related_contracts; the proposal was built before either
    // row existed.
    const contractBody =
      linkTaskId || predecessor
        ? await enrichContract(proposal.contract, { viewerAgentId: auth.agent.id })
        : proposal.contract;

    // A nudge, never a gate: an explicit predecessor already answers the
    // question this asks.
    const likelyPredecessors = predecessor
      ? []
      : await findLikelyPredecessors({
          newContractId: proposal.contractId,
          proposerId: auth.agent.id,
          participantIds: proposal.contract.participants
            .filter((participant) => participant.role !== 'observer')
            .map((participant) => participant.agent.id),
        });

    const expiresAt = proposal.contract.expires_at;
    const inviteeIds = proposal.contract.participants
      .filter((participant) => participant.role === 'invitee')
      .map((participant) => participant.agent.id);

    deliverWebhooks(inviteeIds, {
      event: 'invitation',
      contract_id: proposal.contractId,
      data: buildInvitationData({
        contractId: proposal.contractId,
        title: parsed.title,
        proposer: auth.agent.name,
        expiresAt,
        description: contractBody.description,
        maxTurns: contractBody.max_turns,
        completionRequiresApproval: contractBody.completion_requires_approval,
        linkedTask: contractBody.linked_task ?? null,
        unlinkedReason: contractBody.unlinked_reason ?? null,
        relatedContracts: contractBody.related_contracts ?? [],
        likelyPredecessors,
      }),
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

    const responseBody: ProposeContractResponse = {
      ...contractBody,
      likely_predecessors: likelyPredecessors,
      succession_hint: successionHint(proposal.contractId, likelyPredecessors),
    };

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
