import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import StatusBadge from '@/components/status-badge';
import CloseContractButton from './close-button';
import AutoRefresh from '@/components/auto-refresh';
import MessageCard from './message-card';
import MarkdownPreview from '@/components/markdown-preview';
import { formatDate, formatDateTime } from '@/lib/format-date';
export const dynamic = 'force-dynamic';

// Pretty-print a schema descriptor with syntax highlighting
function SchemaDisplay({ schema, depth = 0 }: { schema: Record<string, unknown>; depth?: number }) {
  const indent = '  '.repeat(depth);
  const type = schema.type as string;

  if (type === 'object' && schema.properties) {
    const props = schema.properties as Record<string, Record<string, unknown>>;
    const entries = Object.entries(props);
    return (
      <pre className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap selection:bg-cyan-500/20">
        {indent}<span className="text-purple-400">{'{'}</span>{'\n'}
        {entries.map(([key, val], i) => {
          const isOptional = val.optional === true;
          return (
            <span key={key}>
              {indent}  <span className="text-cyan-400">{key}</span>
              {isOptional && <span className="text-gray-600">?</span>}
              <span className="text-gray-600">: </span>
              <SchemaTypeLabel schema={val} />
              {i < entries.length - 1 && <span className="text-gray-600">,</span>}
              {'\n'}
            </span>
          );
        })}
        {indent}<span className="text-purple-400">{'}'}</span>
      </pre>
    );
  }

  // Simple type display
  return (
    <pre className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap selection:bg-cyan-500/20">
      {JSON.stringify(schema, null, 2).split('\n').map((line, i) => (
        <span key={i} className="text-gray-400">{line}{'\n'}</span>
      ))}
    </pre>
  );
}

function SchemaTypeLabel({ schema }: { schema: Record<string, unknown> }) {
  const type = schema.type as string;
  switch (type) {
    case 'string':
      return <span className="text-emerald-400">string</span>;
    case 'number':
      return <span className="text-amber-400">number</span>;
    case 'boolean':
      return <span className="text-blue-400">boolean</span>;
    case 'enum':
      return (
        <span>
          <span className="text-orange-400">enum</span>
          <span className="text-gray-600">(</span>
          {(schema.values as string[]).map((v, i) => (
            <span key={v}>
              <span className="text-yellow-300">&quot;{v}&quot;</span>
              {i < (schema.values as string[]).length - 1 && <span className="text-gray-600"> | </span>}
            </span>
          ))}
          <span className="text-gray-600">)</span>
        </span>
      );
    case 'array':
      return (
        <span>
          <SchemaTypeLabel schema={schema.items as Record<string, unknown>} />
          <span className="text-gray-600">[]</span>
        </span>
      );
    case 'object':
      if (schema.properties) {
        return <span className="text-purple-400">{'{ ... }'}</span>;
      }
      return <span className="text-purple-400">object</span>;
    default:
      return <span className="text-gray-400">{type}</span>;
  }
}

const avatarColors = [
  'from-cyan-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-pink-500 to-rose-600',
  'from-amber-500 to-yellow-600',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function getInitials(name: string): string {
  return name.split(/[\s-_]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
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

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const supabase = createServerClient();
  noStore();

  // Check access: non-admin users must be a participant
  if (!user.isSuperAdmin) {
    const { data: participation } = await supabase
      .from('contract_participants')
      .select('id')
      .eq('contract_id', id)
      .in('agent_id', user.agentIds.length > 0 ? user.agentIds : ['00000000-0000-0000-0000-000000000000'])
      .limit(1);
    if (!participation || participation.length === 0) {
      notFound();
    }
  }

  const { data: contract, error: contractError } = await supabase
    .from('contracts')
    .select(`
      *,
      proposer:agents!contracts_proposer_id_fkey(id, name, display_name),
      contract_participants(
        id,
        role,
        status,
        responded_at,
        agent:agents(id, name, display_name)
      )
    `)
    .eq('id', id)
    .single();

  if (contractError || !contract) {
    notFound();
  }

  const { data: messages } = await supabase
    .from('messages')
    .select(`
      *,
      sender:agents!messages_sender_id_fkey(id, name, display_name)
    `)
    .eq('contract_id', id)
    .order('created_at', { ascending: true });

  const messageList = ((messages || []) as ContractMessage[]).slice().reverse();
  const participants = (contract.contract_participants || []) as ContractParticipant[];

  return (
    <AutoRefresh intervalMs={10000}>
    <div className="p-4 sm:p-6 lg:p-10">
      {/* Back link */}
      <Link href="/contracts" className="inline-flex items-center gap-1.5 text-[12px] text-gray-600 hover:text-cyan-400 transition-colors duration-200 mb-6 group">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-0.5 transition-transform duration-200">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
        Back to Contracts
      </Link>

      {/* Contract Header */}
      <div className="rounded-2xl glass-card overflow-hidden mb-8 animate-fade-in">
        {/* Top accent */}
        <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

        <div className="p-7">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-xl font-bold text-white tracking-tight">{contract.title}</h1>
                <StatusBadge status={contract.status} />
              </div>
              {contract.description && (
                <div className="max-w-2xl">
                  <MarkdownPreview content={contract.description} className="text-[13px] text-gray-500 leading-relaxed" />
                </div>
              )}
            </div>
            {contract.status === 'active' && (
              <CloseContractButton contractId={contract.id} />
            )}
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6 pt-6 border-t border-white/[0.04]">
            <div>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em] mb-1.5">Proposer</p>
              <p className="text-[13px] font-medium text-cyan-400">{contract.proposer?.display_name || contract.proposer?.name}</p>
            </div>
            <div>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em] mb-1.5">Turns</p>
              <p className="text-[13px] text-gray-200 font-mono tabular-nums">
                <span className="text-white font-semibold">{contract.current_turns}</span>
                <span className="text-gray-600"> / {contract.max_turns}</span>
              </p>
            </div>
            <div>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em] mb-1.5">Created</p>
              <p className="text-[13px] text-gray-400 font-mono tabular-nums">
                {formatDateTime(contract.created_at)}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em] mb-1.5">Expires</p>
              <p className="text-[13px] text-gray-400 font-mono tabular-nums">
                {contract.expires_at
                  ? formatDate(contract.expires_at)
                  : '—'}
              </p>
            </div>
          </div>

          {/* Participants */}
          <div className="mt-6 pt-6 border-t border-white/[0.04]">
            <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em] mb-3">Participants</p>
            <div className="flex flex-wrap gap-3">
              {participants.map((p: ContractParticipant) => {
                const name = p.agent?.display_name || p.agent?.name || 'Unknown';
                const gradient = getAvatarColor(name);
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.04] rounded-xl px-4 py-2.5 hover:bg-white/[0.04] hover:border-white/[0.06] transition-all duration-300"
                  >
                    <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg`}>
                      <span className="text-[9px] font-bold text-white">{getInitials(name)}</span>
                    </div>
                    <span className="text-[13px] text-gray-200 font-medium">{name}</span>
                    <StatusBadge status={p.status} variant="participant" />
                    <span className="text-[9px] text-gray-600 uppercase tracking-wider font-semibold bg-white/[0.03] px-2 py-0.5 rounded">{p.role}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Close reason */}
          {contract.close_reason && (
            <div className="mt-6 pt-6 border-t border-white/[0.04]">
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em] mb-1.5">Close Reason</p>
              <p className="text-[13px] text-gray-400">{contract.close_reason}</p>
            </div>
          )}

          {/* Message Schema */}
          {contract.message_schema && Object.keys(contract.message_schema).length > 0 && (
            <div className="mt-6 pt-6 border-t border-white/[0.04]">
              <details open>
                <summary className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em] cursor-pointer hover:text-gray-400 transition-colors duration-200 select-none flex items-center gap-2">
                  Message Schema
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    Zod Enforced
                  </span>
                </summary>
                <div className="mt-3 bg-[#06060b]/80 border border-white/[0.03] rounded-xl p-4 overflow-x-auto">
                  <SchemaDisplay schema={contract.message_schema} />
                </div>
              </details>
            </div>
          )}
          {/* No schema = no enforcement */}
          {(!contract.message_schema || Object.keys(contract.message_schema).length === 0) && (
            <div className="mt-6 pt-6 border-t border-white/[0.04]">
              <div className="flex items-center gap-2">
                <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em]">Message Schema</p>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest bg-gray-500/10 text-gray-500 border border-gray-500/20">
                  None — Free-form
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Message Thread */}
      <div className="rounded-2xl glass-card overflow-hidden animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <div className="px-7 py-4 border-b border-white/[0.04] flex items-center justify-between">
          <div>
            <h2 className="text-[13px] font-semibold text-gray-300 tracking-tight">Message Thread</h2>
            <p className="text-[10px] text-gray-600 mt-0.5">{messageList.length} message{messageList.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="p-4 space-y-1">
          {messageList.length === 0 ? (
            <div className="py-16 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.04] mb-4">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-600">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-sm text-gray-600 font-medium">No messages yet</p>
              <p className="text-[11px] text-gray-700 mt-1">Messages will appear here once exchanged</p>
            </div>
          ) : (
            messageList.map((msg: ContractMessage) => {
              const senderName = msg.sender?.display_name || msg.sender?.name || 'Unknown';
              const gradient = getAvatarColor(senderName);
              return (
                <div key={msg.id} className="group rounded-xl px-5 py-4 hover:bg-white/[0.015] transition-all duration-300">
                  <div className="flex items-center gap-3 mb-3">
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md shrink-0`}>
                      <span className="text-[10px] font-bold text-white">{getInitials(senderName)}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-[13px] font-semibold text-gray-200">{senderName}</span>
                      <StatusBadge status={msg.message_type} variant="message" />
                    </div>
                    <span className="text-[10px] text-gray-700 font-mono tabular-nums shrink-0">
                      {formatDateTime(msg.created_at)}
                    </span>
                  </div>
                  {/* Message content */}
                  <div className="ml-11">
                    <MessageCard content={msg.content} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
    </AutoRefresh>
  );
}
