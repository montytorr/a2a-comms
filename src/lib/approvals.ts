import { createServerClient } from './supabase/server';
import { deliverWebhooks } from './webhooks';

export interface PendingApproval {
  id: string;
  action: string;
  actor: string;
  details: Record<string, unknown>;
  status: 'pending' | 'approved' | 'denied' | 'consumed';
  reviewed_by: string | null;
  created_at: string;
  reviewed_at: string | null;
}

/**
 * Check whether an agent is authorized to review approvals.
 * Only agents whose owner is a super_admin can approve/deny requests.
 */
export async function isAuthorizedReviewer(agentId: string): Promise<boolean> {
  const supabase = createServerClient();

  const { data: agent } = await supabase
    .from('agents')
    .select('owner_user_id')
    .eq('id', agentId)
    .single();

  if (!agent?.owner_user_id) return false;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_super_admin')
    .eq('id', agent.owner_user_id)
    .single();

  return profile?.is_super_admin === true;
}

/**
 * Get agent IDs whose owners are super_admins (for scoped webhook delivery).
 */
async function getAdminAgentIds(): Promise<string[]> {
  const supabase = createServerClient();

  const { data: admins } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('is_super_admin', true);

  if (!admins || admins.length === 0) return [];

  const adminUserIds = admins.map((a) => a.id);
  const { data: agents } = await supabase
    .from('agents')
    .select('id')
    .in('owner_user_id', adminUserIds);

  return (agents || []).map((a) => a.id);
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

  // Deliver approval.requested webhook only to admin agents (authorized reviewers)
  const adminIds = await getAdminAgentIds();
  if (adminIds.length > 0) {
    deliverWebhooks(adminIds, {
      event: 'approval.requested',
      approval_id: data.id,
      data: { action: opts.action, actor: opts.actor },
      timestamp: new Date().toISOString(),
    }).catch(() => {}); // fire-and-forget
  }

  return { id: data.id };
}

/**
 * Approve a pending request.
 * The reviewer must: (1) not be the original actor, (2) be an authorized reviewer (admin).
 */
export async function approveRequest(
  approvalId: string,
  reviewerAgentId: string,
  reviewerName: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();

  // Reviewer authorization: only admin agents can approve
  const authorized = await isAuthorizedReviewer(reviewerAgentId);
  if (!authorized) {
    return { success: false, error: 'Only admin agents can review approvals' };
  }

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
  if (approval.actor === reviewerName || approval.actor === reviewerAgentId) {
    return { success: false, error: 'You cannot approve your own request' };
  }

  const now = new Date().toISOString();

  // Atomic CAS update — only succeeds if status is still 'pending'
  const { data: updated, error: updateErr } = await supabase
    .from('pending_approvals')
    .update({
      status: 'approved',
      reviewed_by: reviewerName,
      reviewed_at: now,
    })
    .eq('id', approvalId)
    .eq('status', 'pending') // CAS guard: prevents race conditions
    .select('*')
    .maybeSingle();

  if (updateErr || !updated) {
    return { success: false, error: 'Approval already decided by another reviewer' };
  }

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
 * Atomically consume an approved request so it cannot be replayed.
 * Returns the approval row if consumption succeeded, or null if already consumed / not approved.
 * Uses a conditional update (status must still be 'approved') to prevent races.
 */
export async function consumeApproval(
  approvalId: string,
  executorName: string
): Promise<PendingApproval | null> {
  const supabase = createServerClient();
  const now = new Date().toISOString();

  // Step 1: Read the current approval to capture original details
  const { data: current } = await supabase
    .from('pending_approvals')
    .select('*')
    .eq('id', approvalId)
    .eq('status', 'approved')
    .maybeSingle();

  if (!current) return null;

  const originalDetails = (current.details as Record<string, unknown>) || {};

  // Step 2: Atomic conditional update — only succeeds if still 'approved'
  const { data, error } = await supabase
    .from('pending_approvals')
    .update({
      status: 'consumed',
      details: {
        ...originalDetails,
        executed: true,
        executed_at: now,
        executed_by: executorName,
      },
    })
    .eq('id', approvalId)
    .eq('status', 'approved') // CAS guard: fails if another thread consumed it first
    .select('*')
    .maybeSingle();

  if (error || !data) return null;

  // Audit log
  await supabase.from('audit_log').insert({
    actor: executorName,
    action: 'approval.consumed',
    resource_type: 'approval',
    resource_id: approvalId,
    details: { approval_action: data.action, original_actor: data.actor },
  });

  return data as unknown as PendingApproval;
}

/**
 * Find and atomically consume the most recent approved request for a given action.
 * Useful when the caller doesn't have a specific approval ID (e.g. kill switch).
 */
export async function consumeApprovalByAction(
  action: string,
  executorName: string
): Promise<PendingApproval | null> {
  const supabase = createServerClient();

  // Find the most recent approved (not yet consumed) approval for this action
  const { data: approval } = await supabase
    .from('pending_approvals')
    .select('id')
    .eq('action', action)
    .eq('status', 'approved')
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!approval) return null;

  // Atomically consume it (handles race if someone else grabs it first)
  return consumeApproval(approval.id, executorName);
}

/**
 * Deny a pending request.
 * The reviewer must: (1) not be the original actor, (2) be an authorized reviewer (admin).
 */
export async function denyRequest(
  approvalId: string,
  reviewerAgentId: string,
  reviewerName: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();

  // Reviewer authorization: only admin agents can deny
  const authorized = await isAuthorizedReviewer(reviewerAgentId);
  if (!authorized) {
    return { success: false, error: 'Only admin agents can review approvals' };
  }

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

  if (approval.actor === reviewerName || approval.actor === reviewerAgentId) {
    return { success: false, error: 'You cannot deny your own request' };
  }

  const now = new Date().toISOString();

  // Atomic CAS update — only succeeds if status is still 'pending'
  const { data: updated, error: updateErr } = await supabase
    .from('pending_approvals')
    .update({
      status: 'denied',
      reviewed_by: reviewerName,
      reviewed_at: now,
    })
    .eq('id', approvalId)
    .eq('status', 'pending') // CAS guard: prevents race conditions
    .select('*')
    .maybeSingle();

  if (updateErr || !updated) {
    return { success: false, error: 'Approval already decided by another reviewer' };
  }

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
