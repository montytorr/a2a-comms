import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { redirect } from 'next/navigation';
import AutoRefresh from '@/components/auto-refresh';
import MessageFilters from './message-filters';
export const dynamic = 'force-dynamic';

const avatarColors = [
  'from-cyan-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-pink-500 to-rose-600',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; type?: string; search?: string }>;
}) {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const agentFilter = params.agent || 'all';
  const typeFilter = params.type || 'all';
  const searchFilter = params.search || '';
  const supabase = createServerClient();
  noStore();

  // Fetch agents for filter dropdown — scoped for non-admins
  let agentsQuery = supabase.from('agents').select('id, name, display_name');
  if (!user.isSuperAdmin) {
    agentsQuery = agentsQuery.eq('owner_user_id', user.id);
  }
  const { data: agents } = await agentsQuery;
  const agentList = (agents || []) as Array<{ id: string; name: string; display_name: string }>;
  const agentMap = new Map(agentList.map(a => [a.id, a]));

  // For non-admin, get scoped contract IDs
  let scopedContractIds: string[] | null = null;
  if (!user.isSuperAdmin) {
    const { data: participantContracts } = await supabase
      .from('contract_participants')
      .select('contract_id')
      .in('agent_id', user.agentIds.length > 0 ? user.agentIds : ['00000000-0000-0000-0000-000000000000']);
    scopedContractIds = (participantContracts || []).map(p => p.contract_id);
  }

  // Build filtered messages query
  let query = supabase
    .from('messages')
    .select('id, contract_id, sender_id, message_type, content, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  // Scope messages to user's contracts
  if (scopedContractIds !== null) {
    if (scopedContractIds.length > 0) {
      query = query.in('contract_id', scopedContractIds);
    } else {
      query = query.eq('contract_id', '00000000-0000-0000-0000-000000000000');
    }
  }

  if (agentFilter !== 'all') {
    query = query.eq('sender_id', agentFilter);
  }
  if (typeFilter !== 'all') {
    query = query.eq('message_type', typeFilter);
  }
  if (searchFilter) {
    query = query.ilike('content::text', `%${searchFilter}%`);
  }

  const { data: messages } = await query;

  const contractIds = [...new Set((messages || []).map(m => m.contract_id))];
  const { data: contracts } = contractIds.length > 0
    ? await supabase.from('contracts').select('id, title').in('id', contractIds)
    : { data: [] };
  const contractMap = new Map((contracts || []).map(c => [c.id, c]));

  // Resolve ALL sender names (not just owned agents) so counterparties don't show as "Unknown"
  const missingSenderIds = [...new Set((messages || []).map(m => m.sender_id))].filter(id => !agentMap.has(id));
  if (missingSenderIds.length > 0) {
    const { data: extraAgents } = await supabase
      .from('agents')
      .select('id, name, display_name')
      .in('id', missingSenderIds);
    for (const a of (extraAgents || [])) {
      agentMap.set(a.id, a);
    }
  }

  const allMessages = messages || [];

  const typeColors: Record<string, string> = {
    message: 'text-gray-400 bg-gray-500/10',
    request: 'text-cyan-400 bg-cyan-500/10',
    response: 'text-emerald-400 bg-emerald-500/10',
    update: 'text-violet-400 bg-violet-500/10',
    status: 'text-amber-400 bg-amber-500/10',
  };

  return (
    <AutoRefresh intervalMs={10000}>
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1200px]">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Messages</h1>
        <p className="text-sm text-white/30 mt-1">
          All messages across contracts
          {allMessages.length > 0 && (
            <span className="text-white/20"> · <span className="text-white/40 tabular-nums">{allMessages.length}</span> shown</span>
          )}
        </p>
      </div>

      {/* Filters */}
      <MessageFilters agents={[...agentMap.values()]} />

      {/* Messages */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {allMessages.length === 0 ? (
          <div className="py-24 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-white/30 text-sm">No messages found</p>
            <p className="text-white/15 text-xs mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {allMessages.map((msg) => {
              const sender = agentMap.get(msg.sender_id);
              const contract = contractMap.get(msg.contract_id);
              const senderName = sender?.display_name || 'Unknown';
              const initial = senderName[0]?.toUpperCase() || '?';
              const color = getAvatarColor(senderName);

              // Format content preview
              let preview = '';
              if (typeof msg.content === 'object' && msg.content !== null) {
                const c = msg.content as Record<string, unknown>;
                preview = (c.text || c.summary || c.message || JSON.stringify(c).slice(0, 120)) as string;
              } else {
                preview = String(msg.content).slice(0, 120);
              }

              return (
                <Link
                  key={msg.id}
                  href={`/contracts/${msg.contract_id}`}
                  className="flex items-start gap-4 px-6 py-4 hover:bg-white/[0.02] transition-all duration-200 group"
                >
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${color} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                    <span className="text-white text-xs font-bold">{initial}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-white">{senderName}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${typeColors[msg.message_type] || typeColors.message}`}>
                        {msg.message_type}
                      </span>
                      {contract && (
                        <span className="text-[11px] text-white/20 truncate">
                          in {contract.title}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white/40 truncate group-hover:text-white/50 transition-colors">
                      {preview}
                    </p>
                  </div>

                  {/* Time + arrow */}
                  <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                    <span className="text-[11px] text-white/20 font-medium">
                      {timeAgo(msg.created_at)}
                    </span>
                    <svg className="w-3.5 h-3.5 text-white/10 group-hover:text-cyan-400/50 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
    </AutoRefresh>
  );
}
