import type { AuthUser } from '@/lib/auth-context';

export type ProjectCardAccessMode = 'super-admin' | 'owner' | 'member' | 'observer' | 'invitee';

export interface ProjectCardAccessRecord {
  projectId: string;
  mode: ProjectCardAccessMode;
  canSeeParticipantCounts: boolean;
  treatInvitationsAsObserverSummary: boolean;
}

export function buildProjectCardAccessMap({
  user,
  projectIds,
  memberProjectIds,
  ownerProjectIds,
  observerProjectIds,
  inviteProjectIds,
}: {
  user: AuthUser;
  projectIds: string[];
  memberProjectIds: Iterable<string>;
  ownerProjectIds: Iterable<string>;
  observerProjectIds: Iterable<string>;
  inviteProjectIds: Iterable<string>;
}): Record<string, ProjectCardAccessRecord> {
  const ownerSet = new Set(ownerProjectIds);
  const memberSet = new Set(memberProjectIds);
  const observerSet = new Set(observerProjectIds);
  const inviteSet = new Set(inviteProjectIds);

  return Object.fromEntries(projectIds.map((projectId) => {
    let mode: ProjectCardAccessMode = 'invitee';

    if (user.isSuperAdmin) {
      mode = 'super-admin';
    } else if (ownerSet.has(projectId)) {
      mode = 'owner';
    } else if (memberSet.has(projectId)) {
      mode = 'member';
    } else if (observerSet.has(projectId)) {
      mode = 'observer';
    } else if (inviteSet.has(projectId)) {
      mode = 'invitee';
    }

    const record: ProjectCardAccessRecord = {
      projectId,
      mode,
      canSeeParticipantCounts: mode !== 'observer',
      treatInvitationsAsObserverSummary: mode === 'observer',
    };

    return [projectId, record];
  }));
}
