'use client';

import { useState, useRef, useTransition } from 'react';
import MarkdownPreview from '@/components/markdown-preview';
import { addComment } from './actions';
import { formatRelative } from '@/lib/format-date';
import { participantDescriptor } from '@/lib/observer-mode';

const avatarColors: string[] = [
  'var(--mint)',
  'var(--peri)',
  'var(--mint-2)',
  'var(--amber)',
  'var(--rose)',
  'var(--amber-2)',
];

function getAvatarIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % avatarColors.length;
}

interface Comment {
  id: string;
  content: string;
  comment_type: string;
  author_name: string | null;
  author_agent_id: string | null;
  author?: { id: string; name: string; display_name: string } | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const typeConfig: Record<string, { icon: string; label: string }> = {
  comment: { icon: '💬', label: 'Comment' },
  analysis: { icon: '👁️', label: 'Observer note' },
  status_change: { icon: '🔄', label: 'Status' },
  assignment: { icon: '👤', label: 'Assignment' },
  system: { icon: '⚙️', label: 'System' },
};

function summarizeMetadata(metadata: Record<string, unknown>) {
  const delegatedBy = typeof metadata.delegated_by_agent_id === 'string' ? metadata.delegated_by_agent_id : null;
  const executor = typeof metadata.executor_agent_id === 'string' ? metadata.executor_agent_id : typeof metadata.new_assignee === 'string' ? metadata.new_assignee : null;
  const contractId = typeof metadata.delegation_contract_id === 'string' ? metadata.delegation_contract_id : typeof metadata.handoff_contract_id === 'string' ? metadata.handoff_contract_id : null;
  const participantRole = typeof metadata.participant_role === 'string' ? metadata.participant_role : null;
  const accessKind = typeof metadata.participant_access_kind === 'string' ? metadata.participant_access_kind : null;
  const participantLabel = participantDescriptor({ role: participantRole, accessKind });
  const observerNote = metadata.observer_note === true;
  const brokerAgentId = typeof metadata.broker_agent_id === 'string' ? metadata.broker_agent_id : null;
  const collaborationMode = typeof metadata.collaboration_mode === 'string' ? metadata.collaboration_mode : null;
  const escalationReason = typeof metadata.escalation_reason === 'string' ? metadata.escalation_reason : null;
  const requestedIntervention = typeof metadata.requested_intervention === 'string' ? metadata.requested_intervention : null;
  const escalationStatus = typeof metadata.escalation_status === 'string' ? metadata.escalation_status : null;

  if (!delegatedBy && !executor && !contractId && !participantLabel && !observerNote && !brokerAgentId && !collaborationMode && !escalationReason && !requestedIntervention && !escalationStatus) return null;

  const parts = [] as string[];
  if (delegatedBy) parts.push(`delegated by ${delegatedBy}`);
  if (executor) parts.push(`executor ${executor}`);
  if (contractId) parts.push(`contract ${contractId}`);
  if (participantLabel) parts.push(participantLabel);
  if (observerNote) parts.push('note only');
  if (brokerAgentId) parts.push(`broker ${brokerAgentId}`);
  if (collaborationMode) parts.push(collaborationMode);
  if (escalationStatus) parts.push(`escalation ${escalationStatus}`);
  if (escalationReason) parts.push(`reason: ${escalationReason}`);
  if (requestedIntervention) parts.push(`ask: ${requestedIntervention}`);
  return parts.join(' · ');
}

function CommentItem({ comment }: { comment: Comment }) {
  const authorName = comment.author?.display_name || comment.author?.name || comment.author_name || 'Unknown';
  const isSystem = comment.comment_type !== 'comment' && comment.comment_type !== 'analysis';
  const config = typeConfig[comment.comment_type] || typeConfig.comment;
  const metadataSummary = summarizeMetadata(comment.metadata || {});

  if (isSystem) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0' }}>
        <div style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'var(--bg-3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          marginTop: 2,
          flexShrink: 0,
        }}>
          {config.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 11, color: 'var(--fg-3)' }}>
            <span style={{ fontWeight: 500, color: 'var(--fg-2)' }}>{authorName}</span>
            {' · '}
            <span>{comment.content}</span>
          </p>
          <p className="mono num" style={{ fontSize: 9, color: 'var(--fg-4)', marginTop: 2 }}>
            {formatRelative(comment.created_at)}
          </p>
          {metadataSummary && (
            <p style={{ fontSize: 9, color: 'var(--fg-4)', marginTop: 4 }}>{metadataSummary}</p>
          )}
        </div>
        <span style={{
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 6px',
          borderRadius: 4,
          fontSize: 8,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--fg-3)',
          background: 'var(--bg-2)',
          border: '1px solid var(--line-1)',
        }}>
          {config.label}
        </span>
      </div>
    );
  }

  const avatarColor = avatarColors[getAvatarIndex(authorName)];

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0' }}>
      <div style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: 'var(--bg-3)',
        border: `1px solid ${avatarColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 700,
        color: avatarColor,
        flexShrink: 0,
        marginTop: 2,
      }}>
        {authorName[0]?.toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-1)' }}>{authorName}</span>
          <span className="mono num" style={{ fontSize: 9, color: 'var(--fg-4)' }}>
            {formatRelative(comment.created_at)}
          </span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--fg-2)' }}>
          <MarkdownPreview content={comment.content} />
        </div>
        {metadataSummary && (
          <p style={{ fontSize: 9, color: 'var(--fg-4)', marginTop: 4 }}>{metadataSummary}</p>
        )}
      </div>
    </div>
  );
}

export default function TaskComments({
  comments,
  projectId,
  taskId,
}: {
  comments: Comment[];
  projectId: string;
  taskId: string;
}) {
  const [content, setContent] = useState('');
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit() {
    const trimmed = content.trim();
    if (!trimmed) return;

    startTransition(async () => {
      await addComment(projectId, taskId, trimmed);
      setContent('');
    });
  }

  // Show chronological (oldest first)
  const sorted = [...comments].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const visibleComments = sorted;

  return (
    <div className="card animate-fade-in" style={{ padding: 24, animationDelay: '0.25s' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <p className="upper" style={{ color: 'var(--fg-4)' }}>
          Activity & Comments
          {comments.length > 0 && (
            <span style={{ marginLeft: 8, color: 'var(--fg-3)', textTransform: 'none', letterSpacing: 'normal', fontWeight: 400 }}>
              ({comments.length})
            </span>
          )}
        </p>
        <span style={{ fontSize: 10, color: 'var(--fg-3)' }}>Chronological feed</span>
      </div>

      {visibleComments.length > 0 ? (
        <div style={{ marginBottom: 16 }}>
          {visibleComments.map((c, i) => (
            <div key={c.id} style={{ borderTop: i > 0 ? '1px solid var(--line-1)' : 'none' }}>
              <CommentItem comment={c} />
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--fg-3)', fontStyle: 'italic', marginBottom: 16 }}>No activity yet.</p>
      )}

      <div style={{ borderTop: '1px solid var(--line-1)', paddingTop: 16 }}>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Add a comment… (markdown supported)"
          disabled={isPending}
          style={{
            width: '100%',
            background: 'var(--bg-2)',
            fontSize: 13,
            color: 'var(--fg-1)',
            lineHeight: 1.6,
            borderRadius: 6,
            padding: 12,
            outline: 'none',
            border: '1px solid var(--line-1)',
            resize: 'none',
            minHeight: 60,
            transition: 'border-color 0.15s',
            fontFamily: 'inherit',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--amber)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--line-1)'; }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: 9, color: 'var(--fg-4)' }}>
            Markdown supported · ⌘+Enter to submit
          </span>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !content.trim()}
            className="btn btn--primary btn--sm"
            style={{ opacity: isPending || !content.trim() ? 0.35 : 1, cursor: isPending || !content.trim() ? 'not-allowed' : 'pointer' }}
          >
            {isPending ? 'Sending…' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  );
}
