import type { ProjectInvitationStatus } from '@/lib/types';

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

export function getInvitationStatusTone(status: ProjectInvitationStatus): string {
  switch (status) {
    case 'pending':
      return 'border-amber-500/20 bg-amber-500/[0.06] text-amber-300';
    case 'accepted':
      return 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300';
    case 'declined':
      return 'border-red-500/20 bg-red-500/[0.06] text-red-300';
    case 'cancelled':
      return 'border-gray-500/20 bg-gray-500/[0.06] text-gray-300';
    case 'expired':
      return 'border-orange-500/20 bg-orange-500/[0.06] text-orange-300';
  }
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
