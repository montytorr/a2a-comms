import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createServerClient } from '@/lib/supabase/server';
import { deliverWebhooks } from '@/lib/webhooks';
import { sendApprovalRequestEmail } from '@/lib/email';
import { getSuperAdminEmails, getAgentOwnerEmail, getApprovalScope } from '@/lib/email/helpers';
import type { ApiError } from '@/lib/types';

export async function GET(req: NextRequest) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'pending';

  const supabase = createServerClient();

  // Agents see only approvals where they are the actor or reviewer
  let query = supabase
    .from('pending_approvals')
    .select('*')
    .or(`actor.eq.${auth.agent.name},reviewed_by.eq.${auth.agent.name}`);

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  query = query.order('created_at', { ascending: false });

  const { data: approvals, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch approvals', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  return NextResponse.json({ data: approvals || [] });
}

export async function POST(req: NextRequest) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;

  // Rate limit
  const limit = await checkRateLimit(`approvals:${auth.agent.id}`, RATE_LIMITS.proposals);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Approval request rate limit exceeded', code: 'RATE_LIMITED' } satisfies ApiError,
      { status: 429 }
    );
  }

  let parsed: { action?: string; details?: Record<string, unknown> };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (!parsed.action) {
    return NextResponse.json(
      { error: 'Missing required field: action', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { data: approval, error } = await supabase
    .from('pending_approvals')
    .insert({
      action: parsed.action,
      actor: auth.agent.name,
      details: parsed.details || {},
      status: 'pending',
    })
    .select('*')
    .single();

  if (error || !approval) {
    return NextResponse.json(
      { error: 'Failed to create approval request', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'approval.requested',
    resourceType: 'approval',
    resourceId: approval.id,
    details: { approval_action: parsed.action, ...parsed.details },
    ipAddress: getClientIp(req),
  });

  // Broadcast approval.requested webhook to ALL agents
  const { data: allAgents } = await supabase.from('agents').select('id');
  if (allAgents && allAgents.length > 0) {
    deliverWebhooks(
      allAgents.map((a) => a.id),
      {
        event: 'approval.requested',
        approval_id: approval.id,
        data: {
          action: parsed.action,
          actor: auth.agent.name,
          details: parsed.details || {},
        },
        timestamp: new Date().toISOString(),
      }
    ).catch(() => {}); // fire-and-forget
  }

  // Email notification — scoped by approval type (fire-and-forget)
  const scope = getApprovalScope(parsed.action as string);
  const emailProps = {
    actionDescription: parsed.action as string,
    requestedBy: auth.agent.display_name || auth.agent.name,
    details: parsed.details ? JSON.stringify(parsed.details, null, 2) : '',
  };

  if (scope === 'admin') {
    // Platform-level actions → email super_admins
    getSuperAdminEmails().then(async (admins) => {
      for (const admin of admins) {
        await sendApprovalRequestEmail(admin.email, emailProps, admin.userId).catch(() => {});
      }
    }).catch(() => {});
  } else {
    // Agent-scoped actions → email the requesting agent's human owner
    getAgentOwnerEmail(auth.agent.name).then(async (owner) => {
      if (owner) {
        await sendApprovalRequestEmail(owner.email, emailProps, owner.userId).catch(() => {});
      }
    }).catch(() => {});
  }

  return NextResponse.json(approval, { status: 201 });
}
