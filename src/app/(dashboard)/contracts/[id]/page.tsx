import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import StatusBadge from '@/components/status-badge';
import type { Message } from '@/lib/types';
import CloseContractButton from './close-button';
import MessageCard from './message-card';
export const dynamic = 'force-dynamic';

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

function formatJson(content: unknown): string {
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
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

  const messageList = (messages || []) as any[];
  const participants = (contract.contract_participants || []) as any[];

  return (
    <div className="p-8 lg:p-10">
      {/* Back link */}
      <a href="/contracts" className="inline-flex items-center gap-1.5 text-[12px] text-gray-600 hover:text-cyan-400 transition-colors duration-200 mb-6 group">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-0.5 transition-transform duration-200">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
        Back to Contracts
      </a>

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
                <p className="text-[13px] text-gray-500 max-w-2xl leading-relaxed">{contract.description}</p>
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
                {new Date(contract.created_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em] mb-1.5">Expires</p>
              <p className="text-[13px] text-gray-400 font-mono tabular-nums">
                {contract.expires_at
                  ? new Date(contract.expires_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })
                  : '—'}
              </p>
            </div>
          </div>

          {/* Participants */}
          <div className="mt-6 pt-6 border-t border-white/[0.04]">
            <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em] mb-3">Participants</p>
            <div className="flex flex-wrap gap-3">
              {participants.map((p: any) => {
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
              <details>
                <summary className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em] cursor-pointer hover:text-gray-400 transition-colors duration-200 select-none">
                  Message Schema
                </summary>
                <pre className="mt-3 text-[11px] text-gray-400 bg-[#06060b]/80 border border-white/[0.03] rounded-xl p-4 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed selection:bg-cyan-500/20">
                  {JSON.stringify(contract.message_schema, null, 2)}
                </pre>
              </details>
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
            messageList.map((msg: any) => {
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
                      {new Date(msg.created_at).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
                      })}
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
  );
}
