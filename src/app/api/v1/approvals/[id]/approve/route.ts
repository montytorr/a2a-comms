import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createServerClient } from '@/lib/supabase/server';
import { deliverWebhooks } from '@/lib/webhooks';
import { isAuthorizedReviewer, consumeApproval } from '@/lib/approvals';
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

  const supabase = createServerClient();

  // Fetch the approval first so we can pass actor to the cross-owner check
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

  // Self-approval prevention: actor cannot approve their own request
  if (approval.actor === auth.agent.name || approval.actor === auth.agent.id) {
    return NextResponse.json(
      { error: 'You cannot approve your own request', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  // Reviewer authorization: admin + cross-owner check against the requesting actor
  const authorized = await isAuthorizedReviewer(auth.agent.id, approval.actor);
  if (!authorized) {
    return NextResponse.json(
      { error: 'Not authorized to review this approval (admin required, cross-owner enforced)', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  const now = new Date().toISOString();

  // Atomic CAS update — only succeeds if status is still 'pending'
  const { data: updated, error: updateErr } = await supabase
    .from('pending_approvals')
    .update({
      status: 'approved',
      reviewed_by: auth.agent.name,
      reviewed_at: now,
    })
    .eq('id', id)
    .eq('status', 'pending') // CAS guard: prevents race conditions
    .select('*')
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json(
      { error: 'Failed to approve request', code: 'DB_ERROR' } satisfies ApiError,
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
    action: 'approval.approved',
    resourceType: 'approval',
    resourceId: id,
    details: { approval_action: approval.action, original_actor: approval.actor },
    ipAddress: getClientIp(req),
  });

  // Deliver approval.approved webhook to the requesting agent
  const { data: actorAgent } = await supabase
    .from('agents')
    .select('id')
    .eq('name', approval.actor)
    .single();
  if (actorAgent) {
    deliverWebhooks([actorAgent.id], {
      event: 'approval.approved',
      approval_id: id,
      data: {
        action: approval.action,
        actor: approval.actor,
        requester: approval.actor,
        approved_by: auth.agent.name,
        reviewed_by: auth.agent.name,
      },
      timestamp: new Date().toISOString(),
    }).catch(() => {}); // fire-and-forget
  }

  // Execute side effects for known action types
  if (approval.action === 'key.rotate') {
    const details = (approval.details as Record<string, unknown>) || {};
    const agentId = details.agent_id as string | undefined;
    const requestedByAgentName = details.requested_by ?? approval.actor;
    if (agentId && requestedByAgentName === approval.actor) {
      const consumed = await consumeApproval(id, auth.agent.name);
      if (consumed) {
        const { data: currentKeys } = await supabase
          .from('service_keys')
          .select('id, key_id, human_owner, label')
          .eq('agent_id', agentId)
          .eq('is_active', true);

        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        for (const key of currentKeys || []) {
          await supabase
            .from('service_keys')
            .update({ expires_at: expiresAt, rotated_at: new Date().toISOString() })
            .eq('id', key.id);
        }

        const agentName = (details.agent_name as string) || 'unknown';
        const keyId = `${agentName}-${Date.now().toString(36)}`;
        const signingSecret = crypto.randomBytes(32).toString('hex');
        const keyHash = crypto.createHash('sha256').update(signingSecret).digest('hex');
        const firstKey = (currentKeys || [])[0];

        await supabase.from('service_keys').insert({
          key_id: keyId,
          key_hash: keyHash,
          signing_secret: signingSecret,
          agent_id: agentId,
          human_owner: firstKey?.human_owner ?? null,
          label: firstKey?.label ? `${firstKey.label} (rotated)` : 'rotated',
          is_active: true,
        }).select('id, key_id, label, is_active').single();

        await auditLog({
          actor: auth.agent.name,
          action: 'key.rotate.executed',
          resourceType: 'agent',
          resourceId: agentId,
          details: {
            agent_name: agentName,
            new_key_id: keyId,
            old_keys_expiring: (currentKeys || []).map((k) => k.key_id),
            approval_id: id,
          },
          ipAddress: getClientIp(req),
        });
      }
    }
  }

  return NextResponse.json(updated);
}
