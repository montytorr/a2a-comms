'use client';

import { useState, useRef, useTransition } from 'react';
import MarkdownPreview from '@/components/markdown-preview';
import { addComment } from './actions';
import { formatRelative } from '@/lib/format-date';
import { participantDescriptor } from '@/lib/observer-mode';

const avatarGradients = [
  'from-cyan-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-pink-500 to-rose-600',
  'from-amber-500 to-yellow-600',
];

function getAvatarIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % avatarGradients.length;
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
      <div className="flex items-start gap-3 py-2">
        <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[10px] mt-0.5 shrink-0">
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-gray-500">
            <span className="font-medium text-gray-400">{authorName}</span>
            {' · '}
            <span>{comment.content}</span>
          </p>
          <p className="text-[9px] text-gray-700 font-mono tabular-nums mt-0.5">
            {formatRelative(comment.created_at)}
          </p>
          {metadataSummary && (
            <p className="text-[9px] text-gray-600 mt-1">{metadataSummary}</p>
          )}
        </div>
        <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider text-gray-600 bg-white/[0.03] border border-white/[0.04]">
          {config.label}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 py-3">
      <div
        className={`w-7 h-7 rounded-full bg-gradient-to-br ${avatarGradients[getAvatarIndex(authorName)]} flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5`}
      >
        {authorName[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[12px] font-medium text-gray-300">{authorName}</span>
          <span className="text-[9px] text-gray-700 font-mono tabular-nums">
            {formatRelative(comment.created_at)}
          </span>
        </div>
        <div className="text-[13px] text-gray-400">
          <MarkdownPreview content={comment.content} />
        </div>
        {metadataSummary && (
          <p className="text-[9px] text-gray-600 mt-1">{metadataSummary}</p>
        )}
      </div>
    </div>
  );
}

export default function TaskComments({
  comments,
  projectId,
  taskId,
  compact = false,
}: {
  comments: Comment[];
  projectId: string;
  taskId: string;
  compact?: boolean;
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

  const visibleComments = compact ? sorted.slice(-6) : sorted;

  return (
    <div className={`rounded-2xl glass-card animate-fade-in ${compact ? 'p-5' : 'p-6'}`} style={{ animationDelay: '0.25s' }}>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em]">
          Activity & Comments
          {comments.length > 0 && (
            <span className="ml-2 text-gray-700 normal-case tracking-normal font-normal">
              ({comments.length})
            </span>
          )}
        </p>
        {compact && comments.length > visibleComments.length && (
          <span className="text-[10px] text-gray-500">Showing latest {visibleComments.length}</span>
        )}
      </div>

      {visibleComments.length > 0 ? (
        <div className="space-y-0 divide-y divide-white/[0.04] mb-4">
          {visibleComments.map((c) => (
            <CommentItem key={c.id} comment={c} />
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-gray-600 italic mb-4">No activity yet.</p>
      )}

      <div className="border-t border-white/[0.06] pt-4">
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
          className="w-full bg-white/[0.03] text-[13px] text-gray-300 leading-relaxed rounded-lg p-3 outline-none ring-1 ring-white/[0.06] focus:ring-cyan-500/30 resize-none placeholder-gray-600 min-h-[60px] transition-all"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[9px] text-gray-700">
            Markdown supported · ⌘+Enter to submit
          </span>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !content.trim()}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {isPending ? 'Sending…' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  );
}
