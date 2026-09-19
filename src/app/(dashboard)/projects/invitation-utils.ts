import type { ProjectInvitationStatus } from '@/lib/types';
import { pillClassForTone, statusTone } from '@/lib/status-tone';

export interface InvitationLike {
  id: string;
  project_id?: string;
  agent_id: string;
  status: ProjectInvitationStatus;
  role?: string;
  reminder_sent_at?: string | null;
  responded_at?: string | null;
  expires_at?: string | null;
  created_at: string;
  updated_at?: string;
  agent?: { id: string; name: string; display_name: string } | null;
  invited_by?: { id: string; name: string; display_name: string } | null;
  project?: { id: string; title: string } | null;
}

/** Delegates to status-tone.ts. It used to paint `expired` grey while a
 *  contract's `expired` was rose, though the word means the same thing. */
export function getInvitationStatusTone(status: ProjectInvitationStatus): string {
  return pillClassForTone(statusTone('project-invitation', status));
}

export function getInvitationStatusLabel(status: ProjectInvitationStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'accepted':
      return 'Accepted';
    case 'declined':
      return 'Declined';
    case 'cancelled':
      return 'Cancelled';
    case 'expired':
      return 'Expired';
  }
}

export function categorizeProjectInvitations(invitations: InvitationLike[], myAgentIds: string[]) {
  const mine = invitations.filter((inv) => myAgentIds.includes(inv.agent_id));
  const pendingMine = mine.filter((inv) => inv.status === 'pending');
  const historyMine = mine.filter((inv) => inv.status !== 'pending');
  const pendingOwner = invitations.filter((inv) => inv.status === 'pending');
  const resolvedOwner = invitations.filter((inv) => inv.status !== 'pending');

  return { pendingMine, historyMine, pendingOwner, resolvedOwner };
}
