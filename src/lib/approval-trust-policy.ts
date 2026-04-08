import { createServerClient } from './supabase/server';
import { getApprovalScope } from './email/helpers';
import { getAdminAgentIds, isAuthorizedReviewer } from './approvals';

export interface ApprovalVisibilityDecision {
  canReview: boolean;
  visibleActors: string[];
  allowedApprovalIds?: string[];
}

/**
 * Determines which approvals an agent may see.
 *
 * Rules:
 * - request actors can always see their own approvals
 * - authorized reviewers can see approvals they are allowed to review
 * - admin-scoped approvals are visible to eligible reviewer agents
 * - owner-scoped approvals are visible only to the actor and eligible reviewers
 */
export async function getApprovalVisibilityForAgent(agentId: string, agentName: string): Promise<ApprovalVisibilityDecision> {
  const supabase = createServerClient();

  const canReviewAny = await isAuthorizedReviewer(agentId);
  const visibleActors = [agentName];

  if (!canReviewAny) {
    return { canReview: false, visibleActors };
  }

  const eligibleReviewerIds = new Set(await getAdminAgentIds());
  if (!eligibleReviewerIds.has(agentId)) {
    return { canReview: false, visibleActors };
  }

  const { data: pendingApprovals } = await supabase
    .from('pending_approvals')
    .select('id, actor, action');

  if (!pendingApprovals || pendingApprovals.length === 0) {
    return { canReview: true, visibleActors };
  }

  const actorNamesNeedingLookup = Array.from(new Set(
    pendingApprovals
      .map((approval) => approval.actor)
      .filter((actor): actor is string => typeof actor === 'string' && actor.length > 0 && actor !== agentName)
  ));

  const actorOwnerByName = new Map<string, string | null>();
  if (actorNamesNeedingLookup.length > 0) {
    const { data: actorAgents } = await supabase
      .from('agents')
      .select('name, owner_user_id')
      .in('name', actorNamesNeedingLookup);

    for (const agent of actorAgents || []) {
      actorOwnerByName.set(agent.name, agent.owner_user_id ?? null);
    }
  }

  const { data: reviewerAgent } = await supabase
    .from('agents')
    .select('owner_user_id')
    .eq('id', agentId)
    .single();

  const reviewerOwnerId = reviewerAgent?.owner_user_id ?? null;

  const allowedApprovalIds = pendingApprovals
    .filter((approval) => {
      if (approval.actor === agentName) return true;

      const scope = getApprovalScope(approval.action || '');
      const actorOwnerId = actorOwnerByName.get(approval.actor) ?? null;

      if (scope === 'admin') {
        return true;
      }

      if (!reviewerOwnerId || !actorOwnerId) {
        return false;
      }

      return reviewerOwnerId !== actorOwnerId;
    })
    .map((approval) => approval.id);

  return {
    canReview: true,
    visibleActors,
    allowedApprovalIds,
  };
}
