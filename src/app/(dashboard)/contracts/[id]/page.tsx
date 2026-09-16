import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import StatusBadge from '@/components/status-badge';
import CloseContractButton from './close-button';
import AutoRefresh from '@/components/auto-refresh';
import MessageCard from './message-card';
import MarkdownPreview from '@/components/markdown-preview';
import AttachmentList from '@/components/attachment-list';
import ContractAttachmentUpload from './attachment-upload';
import { formatDate, formatDateTime } from '@/lib/format-date';
import { participantDescriptor } from '@/lib/observer-mode';
import { splitContractMessagesByVisibility } from '@/lib/contract-observers';
import { Avatar, KV, pillClassForName } from '@/components/atoms';
import { ChevronRight } from 'lucide-react';

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
  sender: { id: string; name: string; display_name: string } | null;
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

  const supabase = createServerClient();
  noStore();

  if (!user.isSuperAdmin) {
    const { data: participation } = await supabase
      .from('contract_participants')
      .select('id')
      .eq('contract_id', id)
      .in('agent_id', auth.agentScope)
      .limit(1);
    if (!participation || participation.length === 0) notFound();
  }

  const { data: contract, error: contractError } = await supabase
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

  const { data: messages } = await supabase
    .from('messages')
    .select(`*, sender:agents!messages_sender_id_fkey(id, name, display_name)`)
    .eq('contract_id', id)
    .order('created_at', { ascending: true });

  const messageList = ((messages || []) as ContractMessage[]).slice().reverse();
  const { threadMessages, observerNotes } = splitContractMessagesByVisibility(messageList);
  const participants = (contract.contract_participants || []) as ContractParticipant[];

  let attachments: Array<Record<string, unknown>> = [];
  const { data: contractAttachments } = await supabase
    .from('task_attachments')
    .select('*')
    .eq('contract_id', id)
    .order('created_at', { ascending: false });
  attachments = (contractAttachments || []) as Array<Record<string, unknown>>;
  const isObserverParticipant = participants.some((participant) => auth.agentScope.includes(participant.agent?.id || '') && participant.role === 'observer');

  const proposerName = contract.proposer?.display_name || contract.proposer?.name || '—';
  const contractIdShort = id.slice(0, 6) + '…' + id.slice(-4);

  return (
    <AutoRefresh intervalMs={10000}>
      <div className="mx-auto w-full max-w-[var(--content-max)] px-4 pt-6 pb-16 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <div className="row gap-2 text-xs" style={{ marginBottom: 14 }}>
          <Link href="/contracts" className="dim" style={{ cursor: 'pointer', textDecoration: 'none', color: 'var(--fg-3)' }}>Contracts</Link>
          <ChevronRight size={11} style={{ color: 'var(--fg-3)' }} />
          <span style={{ color: 'var(--fg-1)' }}>{contractIdShort}</span>
        </div>

        {/* Contract header card */}
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
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

          {/* Metadata */}
          <div className="card card--inset" style={{ padding: 14, marginTop: 18 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <KV label="Proposer">
                <div className="row gap-2">
                  <Avatar name={proposerName} size={20} />
                  <span>{proposerName}</span>
                </div>
              </KV>
              <KV label="Turns"><span className="num mono">{contract.current_turns} · {contract.max_turns}</span></KV>
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
                  <span key={p.id} className={pillClassForName(name)}>
                    <Avatar name={name} size={14} />
                    {name} · {desc}
                  </span>
                );
              })}
            </div>
          </div>

          {isObserverParticipant && (
            <div className="card card--inset" style={{ padding: 12, marginTop: 14, borderColor: 'var(--peri-line)' }}>
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
                      <span
                        className={`pill text-2xs ${contract.closed_by_kind === 'system' ? 'pill--ghost' : 'pill--peri'}`}
                        style={{ height: 16, marginLeft: 6 }}
                      >
                        {contract.closed_by_kind}
                      </span>
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
                <span className="pill pill--mint text-2xs" style={{ height: 16 }}>Zod Enforced</span>
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
                <span className="pill pill--ghost text-2xs" style={{ height: 16 }}>None — Free-form</span>
              </div>
            </div>
          )}
        </div>

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
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div className="h3" style={{ marginTop: 14 }}>No messages yet</div>
              <div className="dim text-sm" style={{ marginTop: 4 }}>Messages will appear here once exchanged</div>
            </div>
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
                        <StatusBadge status={msg.message_type} variant="message" />
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
                        <span className="pill pill--peri text-2xs" style={{ height: 16 }}>observer note</span>
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
      </div>
    </AutoRefresh>
  );
}
