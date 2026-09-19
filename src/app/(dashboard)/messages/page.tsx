import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { MessageSquare, ChevronRight, AlertTriangle } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { redirect } from 'next/navigation';
import AutoRefresh from '@/components/auto-refresh';
import CompactMarkdownPreview from '@/components/compact-markdown-preview';
import { extractMessagePreview } from '@/lib/message-preview';
import MessageFilters from './message-filters';
import { Avatar, PageFrame, EmptyState } from '@/components/atoms';
import StatusBadge from '@/components/status-badge';
export const dynamic = 'force-dynamic';

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
    // requires_action / consumes_turn are persisted per message and were not
    // even fetched here, so the cross-contract inbox could not say which of
    // these were asking for anything.
    .select('id, contract_id, sender_id, message_type, content, created_at, requires_action, consumes_turn')
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
    const sanitized = searchFilter.replace(/[,().%*\\]/g, '');
    if (sanitized) {
      query = query.or(`content->>summary.ilike.%${sanitized}%,content->>message.ilike.%${sanitized}%,content->>text.ilike.%${sanitized}%`);
    }
  }

  const { data: messages, error: messagesError } = await query;
  if (messagesError) {
    return (
      <PageFrame>
        <div style={{ marginBottom: '28px' }}>
          <p className="upper" style={{ marginBottom: '6px' }}>Communications</p>
          <h1 className="h1">Messages</h1>
          <p className="muted text-sm">Failed to load messages</p>
        </div>
        <div className="card">
          <EmptyState
            tone="error"
            icon={<AlertTriangle size={20} />}
            title="Failed to load messages"
            hint="A database error occurred. The stream is not empty — it could not be read. Please try again later."
          />
        </div>
      </PageFrame>
    );
  }

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
    <AutoRefresh intervalMs={10000} watch={['messages', 'contracts']}>
      <PageFrame>
        {/* Header */}
        <div style={{ marginBottom: '28px' }}>
          <p className="upper" style={{ marginBottom: '6px' }}>Communications</p>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <h1 className="h1">Messages</h1>
              <p className="dim text-sm" style={{ marginTop: '4px' }}>
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
            <EmptyState
              icon={<MessageSquare size={20} />}
              title="No messages found"
              hint="No message matches the current filters. Widen them to see more of the stream."
            />
          ) : (
            <div>
              {allMessages.map((msg, idx) => {
                const sender = agentMap.get(msg.sender_id);
                const contract = contractMap.get(msg.contract_id);
                const senderName = sender?.display_name || 'Unknown';
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
                  >
                    <Avatar name={senderName} size={34} />

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row gap-2" style={{ marginBottom: '4px', flexWrap: 'wrap' }}>
                        <span className="text-sm" style={{ fontWeight: 600, color: 'var(--fg-0)' }}>{senderName}</span>
                        <StatusBadge domain="message-type" status={msg.message_type} dot="none" size="lg" />
                        {msg.consumes_turn === false ? (
                          <StatusBadge status={null} label="no reply needed" tone="neutral" dot="none" size="sm" />
                        ) : msg.requires_action === false ? (
                          <StatusBadge status={null} label="informational" tone="neutral" dot="none" size="sm" />
                        ) : (
                          <StatusBadge status={null} label="reply expected" tone="peri" dot="none" size="sm" />
                        )}
                        {contract && (
                          <span className="dim text-2xs" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            in {contract.title}
                          </span>
                        )}
                      </div>
                      <CompactMarkdownPreview content={preview} />
                    </div>

                    {/* Time + arrow */}
                    <div className="row gap-2" style={{ flexShrink: 0, paddingTop: '2px', alignItems: 'center' }}>
                      <span className="mono num dim text-2xs">
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
      </PageFrame>
    </AutoRefresh>
  );
}
