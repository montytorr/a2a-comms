'use client';

import Link from 'next/link';
import { useState, useRef, useTransition } from 'react';
import MarkdownPreview from '@/components/markdown-preview';
import { Avatar, EmptyState } from '@/components/atoms';
import { addComment } from './actions';
import { formatRelative } from '@/lib/format-date';
import { participantDescriptor } from '@/lib/observer-mode';
import { Eye, MessageSquare, RefreshCw, Settings2, UserRound, type LucideIcon } from 'lucide-react';
import styles from './task-comments.module.css';

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

type Detail = { label: string; value: string; href?: string; title?: string };

const typeConfig: Record<string, { icon: LucideIcon; label: string }> = {
  comment: { icon: MessageSquare, label: 'Comment' },
  analysis: { icon: Eye, label: 'Observer note' },
  status_change: { icon: RefreshCw, label: 'Status change' },
  assignment: { icon: UserRound, label: 'Assignment' },
  system: { icon: Settings2, label: 'System event' },
};

function shortId(id: string) {
  return `#${id.slice(0, 8)}`;
}

function getContractId(metadata: Record<string, unknown>) {
  if (typeof metadata.delegation_contract_id === 'string') return metadata.delegation_contract_id;
  if (typeof metadata.handoff_contract_id === 'string') return metadata.handoff_contract_id;
  return null;
}

function describeMetadata(metadata: Record<string, unknown>, content: string): Detail[] {
  const details: Detail[] = [];
  const addId = (label: string, id: unknown) => {
    if (typeof id === 'string' && id) details.push({ label, value: shortId(id), title: id });
  };
  addId('Delegated by', metadata.delegated_by_agent_id);
  addId('Executor', metadata.executor_agent_id ?? metadata.new_assignee);
  const contractId = getContractId(metadata);
  if (contractId && !content.includes(contractId)) {
    details.push({ label: 'Contract', value: shortId(contractId), href: `/contracts/${contractId}`, title: contractId });
  }
  const participant = participantDescriptor({
    role: typeof metadata.participant_role === 'string' ? metadata.participant_role : null,
    accessKind: typeof metadata.participant_access_kind === 'string' ? metadata.participant_access_kind : null,
  });
  if (participant) details.push({ label: 'Access', value: participant });
  if (metadata.observer_note === true) details.push({ label: 'Note only', value: 'Observer' });
  addId('Broker', metadata.broker_agent_id);
  for (const [key, label] of [
    ['collaboration_mode', 'Mode'],
    ['escalation_status', 'Escalation'],
    ['escalation_reason', 'Reason'],
    ['requested_intervention', 'Request'],
  ] as const) {
    const value = metadata[key];
    if (typeof value === 'string' && value) details.push({ label, value });
  }
  return details;
}

function eventText(content: string, contractId: string | null) {
  const readable = content.replace(/`([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})`/gi, '$1');
  return readable.split(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi).map((part, index) => {
    if (!/^[0-9a-f]{8}-/i.test(part)) return part;
    if (contractId && part.toLowerCase() === contractId.toLowerCase()) {
      return <Link key={index} href={`/contracts/${part}`} className={styles.inlineReference} title={part}>{shortId(part)}</Link>;
    }
    return <code key={index} className={styles.inlineReference} title={part}>{shortId(part)}</code>;
  });
}

function CommentItem({ comment }: { comment: Comment }) {
  const authorName = comment.author?.display_name || comment.author?.name || comment.author_name || 'Unknown';
  const isSystem = comment.comment_type !== 'comment' && comment.comment_type !== 'analysis';
  const config = typeConfig[comment.comment_type] || typeConfig.comment;
  const Icon = config.icon;
  const metadata = comment.metadata || {};
  const contractId = getContractId(metadata);
  const details = describeMetadata(metadata, comment.content);

  return (
    <div className={`${styles.entry} ${isSystem ? styles.system : ''} ${comment.comment_type === 'analysis' ? styles.observer : ''}`}>
      <span className={styles.marker} aria-hidden="true">
        {isSystem ? <Icon size={15} /> : <Avatar name={authorName} size={28} />}
      </span>
      <div className={styles.body}>
        <div className={styles.entryHeader}>
          <span className={styles.author}>{authorName}</span>
          <span className={styles.kind}>{config.label}</span>
          <time className={styles.time} dateTime={comment.created_at}>{formatRelative(comment.created_at)}</time>
        </div>
        {isSystem ? (
          <p className={styles.eventText}>{eventText(comment.content, contractId)}</p>
        ) : (
          <div className={styles.commentText}><MarkdownPreview content={comment.content} /></div>
        )}
        {details.length > 0 && (
          <div className={styles.references}>
            {details.map((detail, index) => (
              detail.href ? (
                <Link key={`${detail.label}-${index}`} href={detail.href} className={styles.reference} title={detail.title}>
                  <span>{detail.label}</span><strong>{detail.value}</strong>
                </Link>
              ) : (
                <span key={`${detail.label}-${index}`} className={styles.reference} title={detail.title}>
                  <span>{detail.label}</span><strong>{detail.value}</strong>
                </span>
              )
            ))}
          </div>
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

  const visibleComments = [...comments].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <section className={`card animate-fade-in ${styles.shell}`} aria-labelledby="task-comments-title">
      <div className={styles.feedHeader}>
        <div>
          <h2 id="task-comments-title" className={styles.feedTitle}>Activity & comments <span className={styles.count}>{comments.length}</span></h2>
          <p className={styles.feedSubtitle}>The decisions, handoffs, and conversation behind this task.</p>
        </div>
        <span className={styles.order}>Oldest first</span>
      </div>
      <div className={styles.feedBody}>
        {visibleComments.length > 0 ? (
          <div className={styles.feed}>
            {visibleComments.map((comment) => <CommentItem key={comment.id} comment={comment} />)}
          </div>
        ) : (
          <EmptyState title="No activity yet" hint="Comments and status changes on this task appear here." />
        )}
      </div>
      <div className={styles.composer}>
        <label htmlFor="task-comment" className={styles.composerLabel}>Add to the conversation</label>
        <textarea
          id="task-comment"
          ref={textareaRef}
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            event.target.style.height = 'auto';
            event.target.style.height = Math.min(event.target.scrollHeight, 200) + 'px';
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Write a comment…"
          disabled={isPending}
          className={`cp-textarea ${styles.textarea}`}
        />
        <div className={styles.composerActions}>
          <span>Markdown supported · ⌘+Enter to send</span>
          <button type="button" onClick={handleSubmit} disabled={isPending || !content.trim()} className="btn btn--primary btn--sm">
            {isPending ? 'Sending…' : 'Comment'}
          </button>
        </div>
      </div>
    </section>
  );
}
