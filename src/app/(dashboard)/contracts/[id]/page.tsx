import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getLinkedTask } from '@/lib/contract-task-link';
import { describeContractLink, getRelatedContracts } from '@/lib/contract-links';
import { deriveContractTurnState } from '@/lib/contract-turn-state';
import { outcomeIsSuccess, resolveCloseOutcome, UNAPPROVED_CLOSE_REASON_MIN, type ContractCloseOutcome } from '@/lib/contract-closure';
import { getNoteAckCounts, getOperatorChannel, getQuestionIdsByMessage } from '@/lib/contract-operator-channel-server';
import { createServerClient } from '@/lib/db/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import StatusBadge from '@/components/status-badge';
import { type Tone } from '@/lib/status-tone';
import type { OperatorQuestionSummary } from '@/lib/types';
import CloseContractButton from './close-button';
import AutoRefresh from '@/components/auto-refresh';
import MessageCard from './message-card';
import MarkdownPreview from '@/components/markdown-preview';
import AttachmentList from '@/components/attachment-list';
import ContractAttachmentUpload from './attachment-upload';
import OperatorChannel from './operator-channel';
import { formatDate, formatDateTime } from '@/lib/format-date';
import { participantDescriptor } from '@/lib/observer-mode';
import { splitContractMessagesByVisibility } from '@/lib/contract-observers';
import { Avatar, KV, PageFrame, EmptyState } from '@/components/atoms';
import { ChevronRight, FolderGit2, GitBranch, Link2Off as LinkOff, CornerUpLeft, CheckCheck, MessageSquareWarning, MessageSquare } from 'lucide-react';
import styles from './contract-detail.module.css';

export const dynamic = 'force-dynamic';

function SchemaDisplay({ schema, depth = 0 }: { schema: Record<string, unknown>; depth?: number }) {
  const indent = '  '.repeat(depth);
  const type = schema.type as string;

  if (type === 'object' && schema.properties) {
    const props = schema.properties as Record<string, Record<string, unknown>>;
    const entries = Object.entries(props);
    return (
      <pre className="text-2xs" style={{ fontFamily: 'var(--mono)', color: 'var(--fg-1)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
        {indent}<span style={{ color: 'var(--peri)' }}>{'{'}</span>{'\n'}
        {entries.map(([key, val], i) => {
          const isOptional = val.optional === true;
          return (
            <span key={key}>
              {indent}  <span style={{ color: 'var(--amber)' }}>{key}</span>
              {isOptional && <span style={{ color: 'var(--fg-3)' }}>?</span>}
              <span style={{ color: 'var(--fg-3)' }}>: </span>
              <SchemaTypeLabel schema={val} />
              {i < entries.length - 1 && <span style={{ color: 'var(--fg-3)' }}>,</span>}
              {'\n'}
            </span>
          );
        })}
        {indent}<span style={{ color: 'var(--peri)' }}>{'}'}</span>
      </pre>
    );
  }

  return (
    <pre className="text-2xs" style={{ fontFamily: 'var(--mono)', color: 'var(--fg-2)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
      {JSON.stringify(schema, null, 2)}
    </pre>
  );
}

function SchemaTypeLabel({ schema }: { schema: Record<string, unknown> }) {
  const type = schema.type as string;
  switch (type) {
    case 'string': return <span style={{ color: 'var(--mint)' }}>string</span>;
    case 'number': return <span style={{ color: 'var(--amber)' }}>number</span>;
    case 'boolean': return <span style={{ color: 'var(--peri)' }}>boolean</span>;
    case 'enum':
      return (
        <span>
          <span style={{ color: 'var(--amber)' }}>enum</span>
          <span style={{ color: 'var(--fg-3)' }}>(</span>
          {(schema.values as string[]).map((v, i) => (
            <span key={v}>
              <span style={{ color: 'var(--amber)' }}>&quot;{v}&quot;</span>
              {i < (schema.values as string[]).length - 1 && <span style={{ color: 'var(--fg-3)' }}> | </span>}
            </span>
          ))}
          <span style={{ color: 'var(--fg-3)' }}>)</span>
        </span>
      );
    case 'array':
      return (
        <span>
          <SchemaTypeLabel schema={schema.items as Record<string, unknown>} />
          <span style={{ color: 'var(--fg-3)' }}>[]</span>
        </span>
      );
    case 'object':
      return <span style={{ color: 'var(--peri)' }}>{schema.properties ? '{ ... }' : 'object'}</span>;
    default: return <span style={{ color: 'var(--fg-3)' }}>{type}</span>;
  }
}

interface ContractParticipant {
  id: string;
  role: string;
  status: string;
  responded_at: string | null;
  agent: { id: string; name: string; display_name: string } | null;
}

interface ContractMessage {
  id: string;
  content: unknown;
  message_type: string;
  created_at: string;
  sender_id: string;
  /** Persisted per message; the UI used to fetch these and never show them. */
  requires_action: boolean | null;
  consumes_turn: boolean | null;
  sender: { id: string; name: string; display_name: string } | null;
}

/** What a message asks of whoever receives it. */
function expectationOf(msg: Pick<ContractMessage, 'message_type' | 'requires_action' | 'consumes_turn'>): {
  label: string;
  tone: Tone;
} {
  if (msg.consumes_turn === false) return { label: 'no reply needed', tone: 'neutral' };
  if (msg.requires_action === false) return { label: 'informational', tone: 'neutral' };
  if (msg.message_type === 'request') return { label: 'reply expected', tone: 'amber' };
  return { label: 'reply expected', tone: 'peri' };
}

/**
 * The question a message opened with `needs_human`, shown on the message so a
 * reader of the thread sees that a person was asked, and where to answer.
 */
function AskedAPerson({ question }: { question: OperatorQuestionSummary }) {
  const open = question.status === 'open';
  return (
    <a href={`#question-${question.id}`} className={styles.askedPerson} data-open={open ? 'true' : 'false'}>
      <MessageSquareWarning size={14} aria-hidden="true" />
      <span className={styles.askedPersonText}>
        <span>
          <strong>Asked a person:</strong> {question.body}
        </span>
        <span className="dim text-2xs">
          {open
            ? `${question.blocking ? 'Blocking · ' : ''}open — answer it in the operator channel`
            : question.status === 'answered'
              ? `Answered by ${question.answered_by_name || 'an operator'}`
              : `Dismissed by ${question.answered_by_name || 'an operator'}`}
        </span>
      </span>
    </a>
  );
}

/**
 * System closers are stored as `system:<cause>` so they stay greppable and
 * cannot collide with an agent name. That prefix is for the database, not for
 * a reader — the pill beside it already says "system".
 */
function formatCloser(closedBy: string) {
  if (!closedBy.startsWith('system:')) return closedBy;
  return closedBy.slice('system:'.length).replace(/-/g, ' ');
}

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) redirect('/login');

  const db = createServerClient();
  noStore();

  // Every read below depends only on the id, so they go out together. They
  // used to be awaited one after another - nine round trips before the first
  // byte of the contract - which is most of why opening one felt slow.
  const [participationResult, contractResult, messagesResult, linkedTask, relatedContracts, attachmentsResult] =
    await Promise.all([
      user.isSuperAdmin
        ? Promise.resolve(null)
        : db
            .from('contract_participants')
            .select('id')
            .eq('contract_id', id)
            .in('agent_id', auth.agentScope)
            .limit(1),
      db
        .from('contracts')
        .select(`
      *,
      proposer:agents!contracts_proposer_id_fkey(id, name, display_name),
      contract_participants(
        id, role, status, responded_at,
        agent:agents(id, name, display_name)
      )
    `)
        .eq('id', id)
        .single(),
      db
        .from('messages')
        .select(`*, sender:agents!messages_sender_id_fkey(id, name, display_name)`)
        .eq('contract_id', id)
        .order('created_at', { ascending: true }),
      getLinkedTask(id),
      getRelatedContracts(id),
      db
        .from('task_attachments')
        .select('*')
        .eq('contract_id', id)
        .order('created_at', { ascending: false }),
    ]);

  if (participationResult && (!participationResult.data || participationResult.data.length === 0)) notFound();

  const { data: contract, error: contractError } = contractResult;
  if (contractError || !contract) notFound();

  const messageList = ((messagesResult.data || []) as ContractMessage[]).slice().reverse();
  const { threadMessages, observerNotes } = splitContractMessagesByVisibility(messageList);
  const participants = (contract.contract_participants || []) as ContractParticipant[];

  // Whose move it is, for whichever of this user's agents is in the contract.
  const viewerAgentId =
    participants.find((p) => p.agent?.id && auth.agentScope.includes(p.agent.id))?.agent?.id ?? null;
  const latestMessage = messageList[0] ?? null;

  // Fetched before the turn state is derived, because a blocking question
  // changes whose move it is. It needs the viewer, so it waits for the
  // participants above.
  const [channel, questionIdsByMessage] = await Promise.all([
    getOperatorChannel(id, viewerAgentId),
    getQuestionIdsByMessage(id),
  ]);
  const ackCounts = await getNoteAckCounts(channel.notes.map((note) => note.id));
  const questionsById = new Map(channel.questions.map((question) => [question.id, question]));
  const questionOpenedBy = (messageId: string) => {
    const questionId = questionIdsByMessage.get(messageId);
    return questionId ? questionsById.get(questionId) ?? null : null;
  };

  const turnState = viewerAgentId
    ? deriveContractTurnState({
        contract,
        viewerAgentId,
        participants: participants.map((p) => ({
          agent_id: p.agent?.id ?? '',
          role: p.role as 'proposer' | 'invitee' | 'observer',
          status: p.status as 'pending' | 'accepted' | 'rejected',
          name: p.agent?.display_name || p.agent?.name || null,
        })),
        lastMessage: latestMessage
          ? {
              sender_id: latestMessage.sender_id,
              message_type: latestMessage.message_type,
              requires_action: latestMessage.requires_action,
              consumes_turn: latestMessage.consumes_turn,
              created_at: latestMessage.created_at,
            }
          : null,
        blockingQuestions: channel.questions
          .filter((question) => question.status === 'open' && question.blocking)
          .map((question) => ({ asked_by_agent_id: question.asked_by_agent_id, kind: question.kind })),
      })
    : null;

  // The header says it for every viewer, including an admin who is not a
  // participant and so has no turn state. When there is one it is the
  // authority, so the header and the turn-state line cannot disagree.
  const waitingOnPerson = turnState
    ? turnState.awaiting === 'human'
    : contract.status === 'active' && channel.questions.some((question) => question.status === 'open' && question.blocking);

  const attachments = (attachmentsResult.data || []) as Array<Record<string, unknown>>;
  const isObserverParticipant = participants.some((participant) => auth.agentScope.includes(participant.agent?.id || '') && participant.role === 'observer');

  const proposerName = contract.proposer?.display_name || contract.proposer?.name || '—';
  const contractIdShort = id.slice(0, 6) + '…' + id.slice(-4);
  const hasClosure = Boolean(contract.close_reason || contract.closed_at || contract.closed_by);
  // "Closed" is not "completed": only an accepted outcome may read as success.
  const closeOutcome = contract.status === 'closed'
    ? resolveCloseOutcome({
        closedBy: contract.closed_by,
        completionApprovedAt: contract.completion_approved_at,
        closedWithoutApproval: contract.closed_without_approval,
      })
    : null;
  // A participant closing an ungated contract is the ordinary ending, so only
  // the endings that positively say the work was not accepted get the caution.
  const closeOutcomeSucceeded = closeOutcome
    ? outcomeIsSuccess(closeOutcome) || closeOutcome === 'closed-by-participant'
    : false;
  const outcomeTitles: Record<ContractCloseOutcome, string> = {
    'completed-approved': 'Contract completed',
    'turns-exhausted': 'Turn budget ran out',
    expired: 'Contract expired',
    'closed-by-participant': 'Contract closed',
    'closed-unapproved': 'Closed without approval',
  };

  return (
    <AutoRefresh intervalMs={10000} watch={['contracts', 'participants', 'messages', 'tasks']}>
      <PageFrame width="wide">
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/contracts">Contracts</Link>
          <ChevronRight size={11} aria-hidden="true" />
          <span>Contract <span className="mono num">{contractIdShort}</span></span>
        </nav>
        <header className={styles.header}>
          <div className={styles.heading}>
            <div className={styles.titleRow}>
              <h1 className="h1">{contract.title}</h1>
              <StatusBadge status={contract.status} size="lg" />
              {waitingOnPerson && (
                <a href="#operator-channel" className={styles.waitingOnPerson} title="An agent asked a person and cannot proceed until it is answered.">
                  <MessageSquareWarning size={13} aria-hidden="true" />
                  Waiting on a person
                </a>
              )}
            </div>
          </div>
          {contract.status === 'active' && !isObserverParticipant && (
            <CloseContractButton
              contractId={contract.id}
              approvalPendingFrom={contract.completion_requires_approval && !contract.completion_approved_at ? proposerName : null}
              reasonMin={UNAPPROVED_CLOSE_REASON_MIN}
            />
          )}
        </header>
        <div className={styles.layout}>
          <div className={styles.sidebar}>
            <aside className={styles.context} aria-label="Contract details">
            {/* Metadata */}
            <div className="card card--pad">
              <h2 className={styles.sideHeading}>At a glance</h2>
              <div className={styles.facts}>
                <KV label="Proposer">
                  <div className="row gap-2">
                    <Avatar name={proposerName} size={20} />
                    <span>{proposerName}</span>
                  </div>
                </KV>
                <KV label="Project">
                  {linkedTask ? (
                    <Link
                      href={`/projects/${linkedTask.project_id}/tasks/${linkedTask.task_id}`}
                      className="row gap-1"
                      style={{ color: 'var(--peri)', textDecoration: 'none', alignItems: 'center' }}
                    >
                      <FolderGit2 size={14} />
                      <span>{linkedTask.project_title || 'Project'}</span>
                    </Link>
                  ) : (
                    <StatusBadge status={null} label="Not linked" tone="amber" dot="none" size="md" />
                  )}
                </KV>
                <KV label="Turns"><span className="num mono">{contract.current_turns} · {contract.max_turns}</span></KV>
                <KV label="Message format">
                  <span>{contract.message_schema && Object.keys(contract.message_schema).length > 0 ? 'Structured' : 'Free-form'}</span>
                </KV>
                <KV label="Created"><span className="num mono">{formatDateTime(contract.created_at)}</span></KV>
                <KV label="Expires">
                  <span className="num mono">{contract.expires_at ? formatDate(contract.expires_at) : '—'}</span>
                </KV>
                {contract.completion_requires_approval && (
                  <div className={styles.fullFact}>
                    <KV label="Completion gate">
                      <StatusBadge
                        status={null}
                        label={contract.completion_approved_at ? 'Approved' : 'Approval required'}
                        tone={contract.completion_approved_at ? 'mint' : 'amber'}
                        dot="none"
                        size="md"
                      />
                    </KV>
                  </div>
                )}
              </div>

              {/* Participants */}
              <div className={styles.participants}>
                <div className="upper" style={{ alignSelf: 'center' }}>Participants</div>
                {participants.map((p) => {
                  const name = p.agent?.display_name || p.agent?.name || 'Unknown';
                  const desc = participantDescriptor({ participantRole: p.role, participantStatus: p.status }) || p.role;
                  return (
                    /* This chip spells the participant's status in its own text
                       ("invitee · accepted"), and it sits inches from the
                       contract's status pill — so it has to be coloured by that
                       status, not by a hash of the agent's name. The Avatar
                       inside it still carries the per-name colour, which is where
                       identity belongs. */
                    <StatusBadge
                      key={p.id}
                      domain="participant"
                      status={p.status}
                      dot="none"
                      size="md"
                      label={<><Avatar name={name} size={14} />{name} · {desc}</>}
                    />
                  );
                })}
              </div>
            </div>

            {!linkedTask && (
              <section className={styles.attention} aria-label="Project task link needed">
                <div className={styles.attentionHeading}>
                  <LinkOff size={16} aria-hidden="true" />
                  <strong>Not linked to a project task</strong>
                </div>
                <p>Linking this contract adds board tracking and enables attachments.</p>
                <details className={styles.attentionDetails}>
                  <summary>How to link it</summary>
                  <code>{`holloway contract-link ${id} --project <project_id> --task <task_id>`}</code>
                </details>
              </section>
            )}

              {contract.description && (
                <section className="card card--pad">
                  <h2 className={styles.sideHeading}>Brief</h2>
                  <div className="muted text-sm"><MarkdownPreview content={contract.description} className="" /></div>
                </section>
              )}
            {relatedContracts.length > 0 && (
              <div className="card card--pad">
                <div className="row gap-2" style={{ alignItems: 'center', marginBottom: 12 }}>
                  <GitBranch size={14} style={{ color: 'var(--peri)', flexShrink: 0 }} />
                  <div className="upper">Related contracts</div>
                </div>
                <div className="col gap-2">
                  {relatedContracts.map((related) => (
                    <div
                      key={`${related.link_type}-${related.direction}-${related.contract_id}`}
                      className="col gap-1"
                      style={{
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-3)',
                        border: '1px solid var(--line-1)',
                        background: 'var(--bg-0)',
                      }}
                    >
                      <div className="row gap-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <StatusBadge
                          status={null}
                          label={describeContractLink(related.link_type, related.direction)}
                          tone="peri"
                          dot="none"
                          size="md"
                        />
                        <Link
                          href={`/contracts/${related.contract_id}`}
                          className="text-sm"
                          style={{ color: 'var(--fg-0)', textDecoration: 'none', fontWeight: 600 }}
                        >
                          {related.title}
                        </Link>
                        <StatusBadge status={related.status} />
                      </div>
                      {related.note && (
                        <p className="text-sm" style={{ color: 'var(--fg-2)', margin: 0 }}>
                          {related.note}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isObserverParticipant && (
              <div className="card card--pad" style={{ borderColor: 'var(--peri-line)' }}>
                <div className="text-2xs" style={{ color: 'var(--peri)' }}>
                  You are attached as a read-only observer on this contract.
                </div>
              </div>
            )}

            {hasClosure && (
              <section className={`card ${styles.outcome} ${closeOutcomeSucceeded ? '' : styles.outcomeCaution}`} aria-labelledby="contract-outcome-heading">
                <div className={styles.outcomeHeader}>
                  <span className={styles.outcomeIcon}>
                    {closeOutcomeSucceeded ? <CheckCheck size={18} /> : <MessageSquareWarning size={18} />}
                  </span>
                  <div>
                    <h2 id="contract-outcome-heading" className={styles.sideHeading}>Outcome</h2>
                    <div className={styles.outcomeTitle}>
                      {closeOutcome ? outcomeTitles[closeOutcome] : `Contract ${contract.status}`}
                    </div>
                  </div>
                </div>
                {contract.close_reason && <p className={styles.outcomeReason}>{contract.close_reason}</p>}
                <div className={styles.outcomeMeta}>
                  {contract.closed_by && (
                    <div>
                      <div className={styles.metaLabel}>Closed by</div>
                      <div className={styles.outcomeValue}>
                        {formatCloser(contract.closed_by)}
                        {contract.closed_by_kind && (
                          <StatusBadge
                            status={contract.closed_by_kind}
                            tone={contract.closed_by_kind === 'system' ? 'neutral' : 'peri'}
                            dot="none"
                            size="sm"
                          />
                        )}
                      </div>
                    </div>
                  )}
                  {contract.closed_at && (
                    <div>
                      <div className={styles.metaLabel}>Closed at</div>
                      <time className={styles.outcomeValue} dateTime={contract.closed_at}>
                        {formatDateTime(contract.closed_at)}
                      </time>
                    </div>
                  )}
                </div>
              </section>
            )}

            {contract.message_schema && Object.keys(contract.message_schema).length > 0 && (
              <section className="card card--pad" aria-labelledby="contract-schema-heading">
                <div className={styles.panelHeading}>
                  <h2 id="contract-schema-heading" className={styles.sideHeading}>Message format</h2>
                  <StatusBadge status={null} label="Enforced" tone="mint" dot="none" size="sm" />
                </div>
                <div className="card card--inset" style={{ padding: 14, overflow: 'auto' }}>
                  <SchemaDisplay schema={contract.message_schema} />
                </div>
              </section>
            )}

            {/* Attachments */}
          <div className="card">
            <div className="row" style={{ padding: '14px 22px', borderBottom: '1px solid var(--line-1)', justifyContent: 'space-between' }}>
              <div className="col gap-1">
                <h2 className="h3">Attachments</h2>
                <div className="dim text-2xs">Artifacts shared on this contract</div>
              </div>
            </div>
            <div style={{ padding: 22 }}>
              {isObserverParticipant ? (
                <div className="dim text-2xs">Observers can inspect artifacts but cannot upload.</div>
              ) : (
                <ContractAttachmentUpload contractId={contract.id} />
              )}
              <div style={{ marginTop: 12 }}>
                <AttachmentList attachments={attachments as never[]} emptyLabel="No contract artifacts yet." />
              </div>
            </div>
          </div>
            </aside>
          </div>
          <main className={styles.main}>
            <OperatorChannel
              contractId={id}
              notes={channel.notes}
              questions={channel.questions}
              agentCount={participants.filter((participant) => participant.role !== 'observer').length}
              ackCounts={ackCounts}
              canWrite={Boolean(user.isSuperAdmin || (viewerAgentId && !isObserverParticipant))}
            />
            {turnState && (
              <div
                className={styles.turnState}
                style={{
                  border: `1px solid ${turnState.awaiting === 'you' ? 'var(--amber-line)' : turnState.awaiting === 'human' ? 'var(--rose-line)' : 'var(--line-1)'}`,
                  background: turnState.awaiting === 'you' ? 'var(--amber-bg)' : turnState.awaiting === 'human' ? 'var(--rose-bg)' : 'var(--bg-2)',
                }}
              >
                {turnState.awaiting === 'you' ? (
                  <CornerUpLeft size={15} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                ) : turnState.awaiting === 'human' ? (
                  <MessageSquareWarning size={15} style={{ color: 'var(--rose)', flexShrink: 0 }} />
                ) : (
                  <CheckCheck size={15} style={{ color: 'var(--fg-3)', flexShrink: 0 }} />
                )}
                <span className="text-sm" style={{ fontWeight: 600, color: 'var(--fg-0)' }}>
                  {turnState.awaiting === 'you'
                    ? 'Your move'
                    : turnState.awaiting === 'human'
                      ? 'Waiting on you, the human'
                      : turnState.awaiting === 'peer'
                        ? `Waiting on ${turnState.awaiting_agent_name || 'the other participant'}`
                        : 'Nothing owed'}
                </span>
                <span className="text-sm" style={{ color: 'var(--fg-2)' }}>{turnState.reason}</span>
              </div>
            )}

          {/* Message Thread */}
          <section className="card" aria-labelledby="contract-thread-heading">
            <div className="row" style={{ padding: '14px 22px', borderBottom: '1px solid var(--line-1)', justifyContent: 'space-between' }}>
              <h2 id="contract-thread-heading" className="h3">Messages <span className="dim text-xs" style={{ fontWeight: 400 }}>· {threadMessages.length} message{threadMessages.length !== 1 ? 's' : ''}</span></h2>
            </div>

            {threadMessages.length === 0 ? (
              <EmptyState
                icon={<MessageSquare size={20} />}
                title="No messages yet"
                hint="Messages appear here as the participants exchange them."
              />
            ) : (
              threadMessages.map((msg, i) => {
                const senderName = msg.sender?.display_name || msg.sender?.name || 'Unknown';
                return (
                  <div key={msg.id} className={styles.message} style={{ borderBottom: i === threadMessages.length - 1 ? 'none' : '1px solid var(--line-1)' }}>
                    <div className="row gap-3" style={{ alignItems: 'flex-start' }}>
                      <Avatar name={senderName} size={32} />
                      <div className="col" style={{ flex: 1, gap: 8 }}>
                        <div className={styles.messageMeta}>
                          <span style={{ fontWeight: 600, color: 'var(--fg-0)' }}>{senderName}</span>
                          <StatusBadge domain="message-type" status={msg.message_type} size="sm" />
                          <StatusBadge
                            status={null}
                            label={expectationOf(msg).label}
                            tone={expectationOf(msg).tone}
                            dot="none"
                            size="sm"
                          />
                          <span className={styles.messageDate}>{formatDateTime(msg.created_at)}</span>
                        </div>
                        {questionOpenedBy(msg.id) && <AskedAPerson question={questionOpenedBy(msg.id)!} />}
                        <div className={styles.messageBody}>
                          <MessageCard content={msg.content} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </section>

          {/* Observer Notes */}
          {observerNotes.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="row" style={{ padding: '14px 22px', borderBottom: '1px solid var(--line-1)', justifyContent: 'space-between' }}>
                <div className="h3" style={{ color: 'var(--peri)' }}>Observer Notes <span className="dim text-xs" style={{ fontWeight: 400 }}>· {observerNotes.length} note{observerNotes.length !== 1 ? 's' : ''}</span></div>
              </div>
              {observerNotes.map((msg, i) => {
                const senderName = msg.sender?.display_name || msg.sender?.name || 'Unknown';
                return (
                  <div key={msg.id} className={styles.message} style={{ borderBottom: i === observerNotes.length - 1 ? 'none' : '1px solid var(--line-1)' }}>
                    <div className="row gap-3" style={{ alignItems: 'flex-start' }}>
                      <Avatar name={senderName} size={32} />
                      <div className="col" style={{ flex: 1, gap: 8 }}>
                        <div className={styles.messageMeta}>
                          <span style={{ fontWeight: 600, color: 'var(--fg-0)' }}>{senderName}</span>
                          <StatusBadge status={null} label="observer note" tone="peri" dot="none" size="sm" />
                          <span className={styles.messageDate}>{formatDateTime(msg.created_at)}</span>
                        </div>
                        <div className={styles.messageBody}>
                          <MessageCard content={msg.content} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </main>
        </div>
      </PageFrame>
    </AutoRefresh>
  );
}
