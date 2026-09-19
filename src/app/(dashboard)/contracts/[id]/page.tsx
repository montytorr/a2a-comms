import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getLinkedTask } from '@/lib/contract-task-link';
import { describeContractLink, getRelatedContracts } from '@/lib/contract-links';
import { deriveContractTurnState } from '@/lib/contract-turn-state';
import { getNoteAckCounts, getOperatorChannel } from '@/lib/contract-operator-channel-server';
import { createServerClient } from '@/lib/db/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import StatusBadge from '@/components/status-badge';
import { type Tone } from '@/lib/status-tone';
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

  if (!user.isSuperAdmin) {
    const { data: participation } = await db
      .from('contract_participants')
      .select('id')
      .eq('contract_id', id)
      .in('agent_id', auth.agentScope)
      .limit(1);
    if (!participation || participation.length === 0) notFound();
  }

  const { data: contract, error: contractError } = await db
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
    .single();

  if (contractError || !contract) notFound();

  const { data: messages } = await db
    .from('messages')
    .select(`*, sender:agents!messages_sender_id_fkey(id, name, display_name)`)
    .eq('contract_id', id)
    .order('created_at', { ascending: true });

  const messageList = ((messages || []) as ContractMessage[]).slice().reverse();
  const { threadMessages, observerNotes } = splitContractMessagesByVisibility(messageList);
  const participants = (contract.contract_participants || []) as ContractParticipant[];

  const linkedTask = await getLinkedTask(id);
  const relatedContracts = await getRelatedContracts(id);

  // Whose move it is, for whichever of this user's agents is in the contract.
  const viewerAgentId =
    participants.find((p) => p.agent?.id && auth.agentScope.includes(p.agent.id))?.agent?.id ?? null;
  const latestMessage = messageList[0] ?? null;

  // Fetched before the turn state is derived, because a blocking question
  // changes whose move it is.
  const channel = await getOperatorChannel(id, viewerAgentId);
  const ackCounts = await getNoteAckCounts(channel.notes.map((note) => note.id));

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

  let attachments: Array<Record<string, unknown>> = [];
  const { data: contractAttachments } = await db
    .from('task_attachments')
    .select('*')
    .eq('contract_id', id)
    .order('created_at', { ascending: false });
  attachments = (contractAttachments || []) as Array<Record<string, unknown>>;
  const isObserverParticipant = participants.some((participant) => auth.agentScope.includes(participant.agent?.id || '') && participant.role === 'observer');

  const proposerName = contract.proposer?.display_name || contract.proposer?.name || '—';
  const contractIdShort = id.slice(0, 6) + '…' + id.slice(-4);

  return (
    <AutoRefresh intervalMs={10000} watch={['contracts', 'participants', 'messages', 'tasks']}>
      <PageFrame>
        {/* Breadcrumb */}
        <div className="row gap-2 text-xs" style={{ marginBottom: 14 }}>
          <Link href="/contracts" className="dim" style={{ cursor: 'pointer', textDecoration: 'none', color: 'var(--fg-3)' }}>Contracts</Link>
          <ChevronRight size={11} style={{ color: 'var(--fg-3)' }} />
          <span style={{ color: 'var(--fg-1)' }}>{contractIdShort}</span>
        </div>

        {/* Contract header card */}
        <div className="card card--pad" style={{ marginBottom: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div className="col gap-2" style={{ flex: 1 }}>
              <div className="row gap-2" style={{ alignItems: 'center' }}>
                <h1 className="h1">{contract.title}</h1>
                <StatusBadge status={contract.status} />
              </div>
              {contract.description && (
                <div className="muted text-sm">
                  <MarkdownPreview content={contract.description} className="" />
                </div>
              )}
            </div>
            {contract.status === 'active' && !isObserverParticipant && (
              <CloseContractButton contractId={contract.id} />
            )}
          </div>

          {turnState && (
            <div
              className="row gap-2"
              style={{
                marginTop: 16,
                padding: '12px 16px',
                borderRadius: 10,
                alignItems: 'center',
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

          {!linkedTask && (
            <div
              className="col gap-2"
              style={{
                marginTop: 16,
                padding: '14px 16px',
                borderRadius: 10,
                border: '1px solid var(--amber-line)',
                background: 'var(--amber-bg)',
              }}
            >
              <div className="row gap-2" style={{ alignItems: 'center' }}>
                <LinkOff size={15} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                <span className="text-sm" style={{ fontWeight: 600, color: 'var(--fg-0)' }}>
                  Not linked to a project task
                </span>
              </div>
              <p className="text-sm" style={{ color: 'var(--fg-2)', margin: 0 }}>
                This contract appears on no board, carries no execution tracking, and
                cannot take attachments. Linking it to a task fixes all three.
              </p>
              <code
                className="mono text-2xs"
                style={{
                  display: 'block',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-2)',
                  background: 'var(--bg-0)',
                  border: '1px solid var(--line-1)',
                  color: 'var(--fg-2)',
                  overflowX: 'auto',
                  whiteSpace: 'pre',
                }}
              >
                {`a2a contract-link ${id} --project <project_id> --task <task_id>`}
              </code>
            </div>
          )}

          {/* Metadata */}
          <div className="card card--inset" style={{ padding: 14, marginTop: 18 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
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
                  <StatusBadge status={null} label="Not linked" tone="amber" dot="none" size="lg" />
                )}
              </KV>
              <KV label="Turns"><span className="num mono">{contract.current_turns} · {contract.max_turns}</span></KV>
              {contract.completion_requires_approval && (
                <KV label="Completion gate">
                  {/* An approved completion gate is a good end (mint); an
                      unapproved one is waiting on a person (amber). It used to
                      paint the approved case peri, the "queued" tone. */}
                  <StatusBadge
                    status={null}
                    label={contract.completion_approved_at ? 'Approved' : 'Approval required'}
                    tone={contract.completion_approved_at ? 'mint' : 'amber'}
                    dot="none"
                    size="lg"
                  />
                </KV>
              )}
              <KV label="Created"><span className="num mono">{formatDateTime(contract.created_at)}</span></KV>
              <KV label="Expires" align="right">
                <span className="num mono">{contract.expires_at ? formatDate(contract.expires_at) : '—'}</span>
              </KV>
            </div>

            {/* Participants */}
            <div className="row gap-3" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-1)', flexWrap: 'wrap' }}>
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
                    size="lg"
                    label={<><Avatar name={name} size={14} />{name} · {desc}</>}
                  />
                );
              })}
            </div>
          </div>

          {relatedContracts.length > 0 && (
            <div className="card card--inset" style={{ padding: 14, marginTop: 18 }}>
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
                      <span className="pill pill--peri">
                        {describeContractLink(related.link_type, related.direction)}
                      </span>
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
            <div className="card card--inset" style={{ padding: 'var(--space-3)', marginTop: 14, borderColor: 'var(--peri-line)' }}>
              <div className="text-2xs" style={{ color: 'var(--peri)' }}>
                You are attached as a read-only observer on this contract.
              </div>
            </div>
          )}

          {(contract.close_reason || contract.closed_at || contract.closed_by) && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line-1)' }}>
              <div className="upper" style={{ marginBottom: 8 }}>Closed</div>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
                {contract.closed_by && (
                  <KV label="Closed by">
                    <span className="text-sm" style={{ color: 'var(--fg-1)' }}>
                      {formatCloser(contract.closed_by)}
                    </span>
                    {contract.closed_by_kind && (
                      <StatusBadge
                        status={contract.closed_by_kind}
                        tone={contract.closed_by_kind === 'system' ? 'neutral' : 'peri'}
                        dot="none"
                        size="sm"
                        style={{ marginLeft: 6 }}
                      />
                    )}
                  </KV>
                )}
                {contract.closed_at && (
                  <KV label="Closed at">
                    <span className="num mono text-sm">{formatDateTime(contract.closed_at)}</span>
                  </KV>
                )}
              </div>
              {contract.close_reason && (
                <div style={{ marginTop: 12 }}>
                  <div className="upper" style={{ marginBottom: 4 }}>Reason</div>
                  <div className="text-sm" style={{ color: 'var(--fg-1)' }}>{contract.close_reason}</div>
                </div>
              )}
            </div>
          )}

          {/* Schema */}
          {contract.message_schema && Object.keys(contract.message_schema).length > 0 && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line-1)' }}>
              <div className="row gap-2" style={{ marginBottom: 8, alignItems: 'center' }}>
                <div className="upper">Message Schema</div>
                <StatusBadge status={null} label="Zod Enforced" tone="mint" dot="none" size="sm" />
              </div>
              <div className="card card--inset" style={{ padding: 14, overflow: 'auto' }}>
                <SchemaDisplay schema={contract.message_schema} />
              </div>
            </div>
          )}
          {(!contract.message_schema || Object.keys(contract.message_schema).length === 0) && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line-1)' }}>
              <div className="row gap-2" style={{ alignItems: 'center' }}>
                <div className="upper">Message Schema</div>
                <StatusBadge status={null} label="None — Free-form" tone="neutral" dot="none" size="sm" />
              </div>
            </div>
          )}
        </div>

        {/* The operator channel: what a person has told the agents here, and
            what the agents have asked back. Placed above the attachments and
            the thread because an unanswered blocking question is the reason
            nothing below it has moved. */}
        <OperatorChannel
          contractId={id}
          notes={channel.notes}
          questions={channel.questions}
          agentCount={participants.filter((participant) => participant.role !== 'observer').length}
          ackCounts={ackCounts}
          canWrite={Boolean(user.isSuperAdmin || (viewerAgentId && !isObserverParticipant))}
        />

        {/* Attachments */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row" style={{ padding: '14px 22px', borderBottom: '1px solid var(--line-1)', justifyContent: 'space-between' }}>
            <div className="col gap-1">
              <div className="h3">Attachments</div>
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

        {/* Message Thread */}
        <div className="card">
          <div className="row" style={{ padding: '14px 22px', borderBottom: '1px solid var(--line-1)', justifyContent: 'space-between' }}>
            <div className="h3">Message Thread <span className="dim text-xs" style={{ fontWeight: 400 }}>· {threadMessages.length} message{threadMessages.length !== 1 ? 's' : ''}</span></div>
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
                <div key={msg.id} style={{ padding: 22, borderBottom: i === threadMessages.length - 1 ? 'none' : '1px solid var(--line-1)' }}>
                  <div className="row gap-3" style={{ alignItems: 'flex-start' }}>
                    <Avatar name={senderName} size={32} />
                    <div className="col" style={{ flex: 1, gap: 8 }}>
                      <div className="row gap-2" style={{ alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: 'var(--fg-0)' }}>{senderName}</span>
                        <StatusBadge domain="message-type" status={msg.message_type} />
                        <StatusBadge
                          status={null}
                          label={expectationOf(msg).label}
                          tone={expectationOf(msg).tone}
                          dot="none"
                          size="sm"
                        />
                        <span className="dim mono num text-2xs" style={{ marginLeft: 'auto' }}>{formatDateTime(msg.created_at)}</span>
                      </div>
                      <div className="text-sm" style={{ color: 'var(--fg-1)', lineHeight: 1.65 }}>
                        <MessageCard content={msg.content} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Observer Notes */}
        {observerNotes.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="row" style={{ padding: '14px 22px', borderBottom: '1px solid var(--line-1)', justifyContent: 'space-between' }}>
              <div className="h3" style={{ color: 'var(--peri)' }}>Observer Notes <span className="dim text-xs" style={{ fontWeight: 400 }}>· {observerNotes.length} note{observerNotes.length !== 1 ? 's' : ''}</span></div>
            </div>
            {observerNotes.map((msg, i) => {
              const senderName = msg.sender?.display_name || msg.sender?.name || 'Unknown';
              return (
                <div key={msg.id} style={{ padding: 22, borderBottom: i === observerNotes.length - 1 ? 'none' : '1px solid var(--line-1)' }}>
                  <div className="row gap-3" style={{ alignItems: 'flex-start' }}>
                    <Avatar name={senderName} size={32} />
                    <div className="col" style={{ flex: 1, gap: 8 }}>
                      <div className="row gap-2" style={{ alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: 'var(--fg-0)' }}>{senderName}</span>
                        <StatusBadge status={null} label="observer note" tone="peri" dot="none" size="sm" />
                        <span className="dim mono num text-2xs" style={{ marginLeft: 'auto' }}>{formatDateTime(msg.created_at)}</span>
                      </div>
                      <div className="text-sm" style={{ color: 'var(--fg-1)', lineHeight: 1.65 }}>
                        <MessageCard content={msg.content} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PageFrame>
    </AutoRefresh>
  );
}
