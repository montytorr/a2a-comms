import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { MessageSquare, ChevronRight } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { redirect } from 'next/navigation';
import AutoRefresh from '@/components/auto-refresh';
import CompactMarkdownPreview from '@/components/compact-markdown-preview';
import { extractMessagePreview } from '@/lib/message-preview';
import MessageFilters from './message-filters';
export const dynamic = 'force-dynamic';

const avatarPalette = [
  { bg: 'var(--mint-bg)', color: 'var(--mint)' },
  { bg: 'var(--peri-bg)', color: 'var(--peri)' },
  { bg: 'var(--amber-bg)', color: 'var(--amber)' },
  { bg: 'var(--rose-bg)', color: 'var(--rose)' },
];

function getAvatarTone(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarPalette[Math.abs(hash) % avatarPalette.length];
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

const typePillTone: Record<string, string> = {
  message: 'pill--ghost',
  request: 'pill--mint',
  response: 'pill--mint',
  update: 'pill--peri',
  status: 'pill--amber',
};

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; type?: string; search?: string }>;
}) {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) redirect('/login');

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
      .in('agent_id', auth.agentScope);
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

  return (
    <AutoRefresh intervalMs={10000}>
      <div style={{ padding: '28px 32px 60px', maxWidth: '1100px' }}>
        {/* Header */}
        <div style={{ marginBottom: '28px' }}>
          <p className="upper" style={{ marginBottom: '6px' }}>Communications</p>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <h1 className="h1">Messages</h1>
              <p className="dim" style={{ fontSize: '13px', marginTop: '4px' }}>
                All messages across contracts
                {allMessages.length > 0 && (
                  <span className="mono num" style={{ marginLeft: '6px', color: 'var(--fg-3)' }}>· {allMessages.length} shown</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <MessageFilters agents={[...agentMap.values()]} />

        {/* Messages */}
        <div className="card">
          {allMessages.length === 0 ? (
            <div style={{ padding: '80px 24px', textAlign: 'center' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '48px',
                  height: '48px',
                  borderRadius: '8px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--line-1)',
                  marginBottom: '14px',
                }}
              >
                <MessageSquare size={20} style={{ color: 'var(--fg-4)' }} />
              </div>
              <p className="muted" style={{ fontSize: '13px', fontWeight: 500 }}>No messages found</p>
              <p className="dim" style={{ fontSize: '11px', marginTop: '4px' }}>Try adjusting your filters</p>
            </div>
          ) : (
            <div>
              {allMessages.map((msg, idx) => {
                const sender = agentMap.get(msg.sender_id);
                const contract = contractMap.get(msg.contract_id);
                const senderName = sender?.display_name || 'Unknown';
                const initial = senderName[0]?.toUpperCase() || '?';
                const tone = getAvatarTone(senderName);

                const preview = extractMessagePreview(msg.content);

                return (
                  <Link
                    key={msg.id}
                    href={`/contracts/${msg.contract_id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '14px',
                      padding: '14px 20px',
                      borderBottom: idx < allMessages.length - 1 ? '1px solid var(--line-1)' : 'none',
                      transition: 'background 0.12s',
                      textDecoration: 'none',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Avatar */}
                    <div
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '50%',
                        background: tone.bg,
                        border: `1px solid ${tone.color}40`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <span className="mono" style={{ fontSize: '12px', fontWeight: 700, color: tone.color }}>{initial}</span>
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row gap-2" style={{ marginBottom: '4px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg-0)' }}>{senderName}</span>
                        <span className={`pill ${typePillTone[msg.message_type] || 'pill--ghost'}`}>
                          {msg.message_type}
                        </span>
                        {contract && (
                          <span className="dim" style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            in {contract.title}
                          </span>
                        )}
                      </div>
                      <CompactMarkdownPreview content={preview} />
                    </div>

                    {/* Time + arrow */}
                    <div className="row gap-2" style={{ flexShrink: 0, paddingTop: '2px', alignItems: 'center' }}>
                      <span className="mono num dim" style={{ fontSize: '11px' }}>
                        {timeAgo(msg.created_at)}
                      </span>
                      <ChevronRight size={14} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
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
