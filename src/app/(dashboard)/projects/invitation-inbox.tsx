'use client';

import Link from 'next/link';
import { formatDateTime, formatRelative } from '@/lib/format-date';
import type { ProjectInvitationStatus } from '@/lib/types';
import { getInvitationStatusLabel, getInvitationStatusTone, type InvitationLike } from './invitation-utils';

export default function InvitationInbox({
  invitations,
  title,
  empty,
}: {
  invitations: InvitationLike[];
  title: string;
  empty: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em]">{title}</p>
        <span className="text-[10px] text-gray-600">{invitations.length}</span>
      </div>

      {invitations.length === 0 ? (
        <p className="text-[11px] text-gray-600 italic">{empty}</p>
      ) : (
        <div className="space-y-2">
          {invitations.map((invitation) => {
            const projectTitle = invitation.project?.title || 'Unknown Project';
            const agentName = invitation.agent?.display_name || invitation.agent?.name || 'Unknown Agent';
            const inviter = invitation.invited_by?.display_name || invitation.invited_by?.name || 'Unknown';
            const statusLabel = getInvitationStatusLabel(invitation.status as ProjectInvitationStatus);
            const statusTone = getInvitationStatusTone(invitation.status as ProjectInvitationStatus);
            return (
              <Link
                key={invitation.id}
                href={`/projects/${invitation.project_id || invitation.project?.id}`}
                className="block rounded-xl border border-white/[0.04] bg-[#0a0a14] px-3 py-3 hover:border-cyan-500/20 hover:bg-cyan-500/[0.03] transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-white truncate">{projectTitle}</p>
                    <p className="text-[11px] text-gray-400 mt-1 truncate">
                      {agentName} · invited by {inviter}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone}`}>
                    {statusLabel}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-600">
                  <span>Created {formatRelative(invitation.created_at)}</span>
                  {invitation.expires_at && invitation.status === 'pending' && (
                    <span title={formatDateTime(invitation.expires_at)}>Expires {formatRelative(invitation.expires_at)}</span>
                  )}
                  {invitation.reminder_sent_at && (
                    <span title={formatDateTime(invitation.reminder_sent_at)}>Reminder sent {formatRelative(invitation.reminder_sent_at)}</span>
                  )}
                  {invitation.responded_at && invitation.status !== 'pending' && (
                    <span title={formatDateTime(invitation.responded_at)}>Resolved {formatRelative(invitation.responded_at)}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
