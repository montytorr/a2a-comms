import {
  evaluateProjectInvitationListPolicyAccess,
  evaluateProjectObserverListPolicyAccess,
  type TrustPolicyAccessContext,
} from '@/lib/agent-trust-policy';
import type { ProjectInvitationStatus } from '@/lib/types';
import type { InvitationLike } from '@/app/(dashboard)/projects/invitation-utils';

export interface ProjectInvitationVisibilityOptions {
  treatAsObserver?: boolean;
  includeObserverSummary?: boolean;
}

export interface ProjectInvitationVisibilityResult<TInvitation extends Pick<InvitationLike, 'status'>> {
  visibleInvitations: TInvitation[];
  hiddenPendingCount: number;
  canListPending: boolean;
  canSeeSummary: boolean;
}

export function applyProjectInvitationVisibility<TInvitation extends Pick<InvitationLike, 'status'>>(
  invitations: TInvitation[],
  context: TrustPolicyAccessContext,
  options: ProjectInvitationVisibilityOptions = {},
): ProjectInvitationVisibilityResult<TInvitation> {
  if (!options.treatAsObserver) {
    return {
      visibleInvitations: invitations,
      hiddenPendingCount: 0,
      canListPending: true,
      canSeeSummary: true,
    };
  }

  const pendingDecision = evaluateProjectInvitationListPolicyAccess(context);
  const observerSummaryDecision = evaluateProjectObserverListPolicyAccess(context);
  const canListPending = pendingDecision.allowed;
  const canSeeSummary = options.includeObserverSummary ? observerSummaryDecision.allowed : false;

  const visibleInvitations = canListPending
    ? invitations
    : invitations.filter((invitation) => invitation.status !== 'pending');

  const hiddenPendingCount = canListPending
    ? 0
    : invitations.filter((invitation) => invitation.status === 'pending').length;

  return {
    visibleInvitations,
    hiddenPendingCount,
    canListPending,
    canSeeSummary,
  };
}
