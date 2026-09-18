import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import { deliverWebhooks } from '@/lib/webhooks';
import { validateQuestionRequest } from '@/lib/contract-operator-channel';
import {
  checkChannelReadAccess,
  checkChannelWriteAccess,
  createContractQuestion,
  getOperatorChannel,
} from '@/lib/contract-operator-channel-server';
import type { ApiError, OperatorChannelCounts, OperatorQuestionSummary } from '@/lib/types';

interface QuestionsResponse {
  contract_id: string;
  operator_questions: OperatorQuestionSummary[];
  operator_channel: OperatorChannelCounts;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id } = await params;

  const refusal = await checkChannelReadAccess(id, auth.agent.id);
  if (refusal) return NextResponse.json(refusal.body, { status: refusal.status });

  const channel = await getOperatorChannel(id, auth.agent.id);
  return NextResponse.json({
    contract_id: id,
    operator_questions: channel.questions,
    operator_channel: channel.counts,
  } satisfies QuestionsResponse);
}

/**
 * Ask a person.
 *
 * The thing an agent has never been able to do. Today a worker that stops and
 * says it is stuck prints neither sanctioned marker, is classified WORKER
 * INCOMPLETE by the reactor, and is retried every fifteen minutes for
 * twenty-four hours - so being blocked is indistinguishable from crashing, and
 * the explanation survives only as 500 truncated characters in a log.
 *
 * Asking is not a turn. It costs nothing from the budget and is allowed while
 * the budget is spent, for the same reason a `receipt` is: an agent that cannot
 * afford to speak still has to be able to say it is stuck. It is refused on a
 * contract that has ended, where there is nothing left to be blocked on.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id } = await params;
  const supabase = createServerClient();

  let parsed: unknown;
  try {
    parsed = body ? JSON.parse(body) : {};
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  const request = validateQuestionRequest(parsed);
  if (!request.ok) return NextResponse.json(request.body, { status: request.status });

  const refusal = await checkChannelWriteAccess(id, auth.agent.id);
  if (refusal) return NextResponse.json(refusal.body, { status: refusal.status });

  const { data: contract } = await supabase
    .from('contracts')
    .select('status, title')
    .eq('id', id)
    .maybeSingle();
  const status = (contract as { status?: string } | null)?.status;
  if (status && ['closed', 'expired', 'cancelled', 'rejected'].includes(status)) {
    return NextResponse.json(
      {
        error: `This contract is ${status}. There is nothing left to be blocked on; raise it on the successor contract instead.`,
        code: 'CONTRACT_NOT_ACTIVE',
      } satisfies ApiError,
      { status: 409 }
    );
  }

  const created = await createContractQuestion({
    contractId: id,
    agentId: auth.agent.id,
    kind: request.value.kind,
    body: request.value.body,
    blocking: request.value.blocking,
  });
  if (!created.ok) return NextResponse.json(created.body, { status: created.status });

  await auditLog({
    actor: auth.agent.name,
    action: 'contract.question_asked',
    resourceType: 'contract',
    resourceId: id,
    details: { question_id: created.id, kind: request.value.kind, blocking: request.value.blocking },
    ipAddress: getClientIp(req),
  });

  // The peers are told so they can see why nothing is moving. It is explicitly
  // not action-required: the answer is owed by a person, not by them, and a
  // reactor that woke an agent for this would wake it to do nothing.
  const { data: participantRows } = await supabase
    .from('contract_participants')
    .select('agent_id')
    .eq('contract_id', id);
  const peers = ((participantRows || []) as Array<{ agent_id: string }>)
    .map((row) => row.agent_id)
    .filter((agentId) => agentId !== auth.agent.id);

  if (peers.length > 0) {
    deliverWebhooks(peers, {
      event: 'contract.question_asked',
      contract_id: id,
      data: {
        question_id: created.id,
        asked_by: auth.agent.name,
        asked_by_agent_id: auth.agent.id,
        kind: request.value.kind,
        blocking: request.value.blocking,
        body: request.value.body,
        requires_action: false,
        attention: 'informational',
      },
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }

  const channel = await getOperatorChannel(id, auth.agent.id);
  return NextResponse.json(
    {
      contract_id: id,
      operator_questions: channel.questions,
      operator_channel: channel.counts,
    } satisfies QuestionsResponse,
    { status: 201 }
  );
}
