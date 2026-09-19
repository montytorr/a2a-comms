'use client';

import Link from 'next/link';
import { formatDateTime, formatRelative } from '@/lib/format-date';
import type { ProjectInvitationStatus } from '@/lib/types';
import { getInvitationStatusLabel, type InvitationLike } from './invitation-utils';
import StatusBadge from '@/components/status-badge';
import { EmptyState } from '@/components/atoms';

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
    <div className="card" style={{ padding: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="upper text-2xs">{title}</div>
        <span className="mono num dim text-2xs">{invitations.length}</span>
      </div>

      {invitations.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <div className="col gap-2">
          {invitations.map((invitation) => {
            const projectTitle = invitation.project?.title || 'Unknown Project';
            const agentName = invitation.agent?.display_name || invitation.agent?.name || 'Unknown Agent';
            const inviter = invitation.invited_by?.display_name || invitation.invited_by?.name || 'Unknown';
            const statusLabel = getInvitationStatusLabel(invitation.status as ProjectInvitationStatus);

            return (
              <Link
                key={invitation.id}
                href={`/projects/${invitation.project_id || invitation.project?.id}`}
                className="card card--inset"
                style={{
                  padding: '10px 12px',
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'block',
                  transition: 'border-color 0.12s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line-2)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line-1)'; }}
              >
                <div className="row" style={{ justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="text-xs" style={{ fontWeight: 500, color: 'var(--fg-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectTitle}</div>
                    <div className="dim text-2xs" style={{ marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {agentName} · invited by {inviter}
                    </div>
                  </div>
                  <StatusBadge
                    domain="project-invitation"
                    status={invitation.status}
                    label={statusLabel}
                    style={{ flexShrink: 0 }}
                  />
                </div>
                <div className="row gap-3 dim mono text-2xs" style={{ marginTop: 6, flexWrap: 'wrap' }}>
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
