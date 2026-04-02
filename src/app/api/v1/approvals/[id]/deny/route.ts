import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createServerClient } from '@/lib/supabase/server';
import { deliverWebhooks } from '@/lib/webhooks';
import { isAuthorizedReviewer } from '@/lib/approvals';
import type { ApiError } from '@/lib/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id } = await params;

  // Rate limit
  const limit = await checkRateLimit(`approvals:${auth.agent.id}`, RATE_LIMITS.proposals);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Approval rate limit exceeded', code: 'RATE_LIMITED' } satisfies ApiError,
      { status: 429 }
    );
  }

  // Reviewer authorization: only admin agents can deny
  const authorized = await isAuthorizedReviewer(auth.agent.id);
  if (!authorized) {
    return NextResponse.json(
      { error: 'Only admin agents can review approvals', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  const supabase = createServerClient();

  // Fetch the approval
  const { data: approval, error } = await supabase
    .from('pending_approvals')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !approval) {
    return NextResponse.json(
      { error: 'Approval request not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  if (approval.status !== 'pending') {
    return NextResponse.json(
      { error: `Request already ${approval.status}`, code: 'ALREADY_RESPONDED' } satisfies ApiError,
      { status: 409 }
    );
  }

  // Self-denial prevention: actor cannot deny their own request
  if (approval.actor === auth.agent.name || approval.actor === auth.agent.id) {
    return NextResponse.json(
      { error: 'You cannot deny your own request', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  const now = new Date().toISOString();

  // Atomic CAS update — only succeeds if status is still 'pending'
  const { data: updated, error: updateErr } = await supabase
    .from('pending_approvals')
    .update({
      status: 'denied',
      reviewed_by: auth.agent.name,
      reviewed_at: now,
    })
    .eq('id', id)
    .eq('status', 'pending') // CAS guard: prevents race conditions
    .select('*')
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json(
      { error: 'Failed to deny request', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  if (!updated) {
    return NextResponse.json(
      { error: 'Approval already decided by another reviewer', code: 'ALREADY_RESPONDED' } satisfies ApiError,
      { status: 409 }
    );
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'approval.denied',
    resourceType: 'approval',
    resourceId: id,
    details: { approval_action: approval.action, original_actor: approval.actor },
    ipAddress: getClientIp(req),
  });

  // Deliver approval.denied webhook to the requesting agent
  const { data: actorAgent } = await supabase
    .from('agents')
    .select('id')
    .eq('name', approval.actor)
    .single();
  if (actorAgent) {
    deliverWebhooks([actorAgent.id], {
      event: 'approval.denied',
      approval_id: id,
      data: {
        action: approval.action,
        actor: approval.actor,
        reviewed_by: auth.agent.name,
      },
      timestamp: new Date().toISOString(),
    }).catch(() => {}); // fire-and-forget
  }

  return NextResponse.json(updated);
}
