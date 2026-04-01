import { createServerClient } from './supabase/server';
import { deliverWebhooks } from './webhooks';

export interface PendingApproval {
  id: string;
  action: string;
  actor: string;
  details: Record<string, unknown>;
  status: 'pending' | 'approved' | 'denied';
  reviewed_by: string | null;
  created_at: string;
  reviewed_at: string | null;
}

/**
 * Request approval for a sensitive operation.
 * Returns the approval ID. The action is not executed until approved.
 */
export async function requestApproval(opts: {
  action: string;
  actor: string;
  details: Record<string, unknown>;
}): Promise<{ id: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('pending_approvals')
    .insert({
      action: opts.action,
      actor: opts.actor,
      details: opts.details,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create approval request: ${error?.message}`);
  }

  // Audit log
  await supabase.from('audit_log').insert({
    actor: opts.actor,
    action: 'approval.requested',
    resource_type: 'approval',
    resource_id: data.id,
    details: { approval_action: opts.action, ...opts.details },
  });

  // Broadcast approval.requested webhook to ALL agents (anyone might review)
  const { data: allAgents } = await supabase.from('agents').select('id');
  if (allAgents && allAgents.length > 0) {
    deliverWebhooks(
      allAgents.map((a) => a.id),
      {
        event: 'approval.requested',
        approval_id: data.id,
        data: { action: opts.action, actor: opts.actor, details: opts.details },
        timestamp: new Date().toISOString(),
      }
    ).catch(() => {}); // fire-and-forget
  }

  return { id: data.id };
}

/**
 * Approve a pending request. The reviewer must not be the original actor.
 */
export async function approveRequest(
  approvalId: string,
  reviewerId: string,
  reviewerName: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();

  // Fetch the approval
  const { data: approval, error } = await supabase
    .from('pending_approvals')
    .select('*')
    .eq('id', approvalId)
    .single();

  if (error || !approval) {
    return { success: false, error: 'Approval request not found' };
  }

  if (approval.status !== 'pending') {
    return { success: false, error: `Request already ${approval.status}` };
  }

  // Self-approval prevention: actor cannot approve their own request
  if (approval.actor === reviewerName || approval.actor === reviewerId) {
    return { success: false, error: 'You cannot approve your own request' };
  }

  const now = new Date().toISOString();

  await supabase
    .from('pending_approvals')
    .update({
      status: 'approved',
      reviewed_by: reviewerName,
      reviewed_at: now,
    })
    .eq('id', approvalId);

  // Audit log
  await supabase.from('audit_log').insert({
    actor: reviewerName,
    action: 'approval.approved',
    resource_type: 'approval',
    resource_id: approvalId,
    details: { approval_action: approval.action, original_actor: approval.actor },
  });

  // Deliver approval.approved webhook to the requesting agent
  // Find agent ID by matching actor name
  const { data: actorAgent } = await supabase
    .from('agents')
    .select('id')
    .eq('name', approval.actor)
    .single();
  if (actorAgent) {
    deliverWebhooks([actorAgent.id], {
      event: 'approval.approved',
      approval_id: approvalId,
      data: {
        action: approval.action,
        actor: approval.actor,
        reviewed_by: reviewerName,
      },
      timestamp: new Date().toISOString(),
    }).catch(() => {}); // fire-and-forget
  }

  return { success: true };
}

/**
 * Deny a pending request.
 */
export async function denyRequest(
  approvalId: string,
  reviewerId: string,
  reviewerName: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();

  const { data: approval, error } = await supabase
    .from('pending_approvals')
    .select('*')
    .eq('id', approvalId)
    .single();

  if (error || !approval) {
    return { success: false, error: 'Approval request not found' };
  }

  if (approval.status !== 'pending') {
    return { success: false, error: `Request already ${approval.status}` };
  }

  if (approval.actor === reviewerName || approval.actor === reviewerId) {
    return { success: false, error: 'You cannot deny your own request' };
  }

  const now = new Date().toISOString();

  await supabase
    .from('pending_approvals')
    .update({
      status: 'denied',
      reviewed_by: reviewerName,
      reviewed_at: now,
    })
    .eq('id', approvalId);

  // Audit log
  await supabase.from('audit_log').insert({
    actor: reviewerName,
    action: 'approval.denied',
    resource_type: 'approval',
    resource_id: approvalId,
    details: { approval_action: approval.action, original_actor: approval.actor },
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
      approval_id: approvalId,
      data: {
        action: approval.action,
        actor: approval.actor,
        reviewed_by: reviewerName,
      },
      timestamp: new Date().toISOString(),
    }).catch(() => {}); // fire-and-forget
  }

  return { success: true };
}
