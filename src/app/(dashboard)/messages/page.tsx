import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { MessageSquare, ChevronRight, AlertTriangle } from 'lucide-react';
import { createServerClient } from '@/lib/db/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { redirect } from 'next/navigation';
import AutoRefresh from '@/components/auto-refresh';
import CompactMarkdownPreview from '@/components/compact-markdown-preview';
import { extractMessagePreview } from '@/lib/message-preview';
import MessageFilters from './message-filters';
import { Avatar, PageFrame, EmptyState } from '@/components/atoms';
import StatusBadge from '@/components/status-badge';
import styles from './messages-list.module.css';
export const dynamic = 'force-dynamic';
const PAGE_SIZE = 30;

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
  searchParams: Promise<{ agent?: string; type?: string; search?: string; page?: string }>;
}) {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) redirect('/login');

  const params = await searchParams;
  const agentFilter = params.agent || 'all';
  const typeFilter = params.type || 'all';
  const searchFilter = params.search || '';
  const requestedPage = Number(params.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 1000 ? requestedPage : 1;
  const pageUrl = (target: number) => {
    const query = new URLSearchParams();
    if (agentFilter !== 'all') query.set('agent', agentFilter);
    if (typeFilter !== 'all') query.set('type', typeFilter);
    if (searchFilter) query.set('search', searchFilter);
    if (target > 1) query.set('page', String(target));
    const suffix = query.toString();
    return `/messages${suffix ? `?${suffix}` : ''}`;
  };
  const db = createServerClient();
  noStore();

  // Fetch agents for filter dropdown — scoped for non-admins
  let agentsQuery = db.from('agents').select('id, name, display_name');
  if (!user.isSuperAdmin) {
    agentsQuery = agentsQuery.eq('owner_user_id', user.id);
  }
  const [{ data: agents }, { data: participantContracts }] = await Promise.all([
    agentsQuery,
    user.isSuperAdmin
      ? Promise.resolve({ data: [] as Array<{ contract_id: string }> })
      : db.from('contract_participants').select('contract_id').in('agent_id', auth.agentScope),
  ]);
  const agentList = (agents || []) as Array<{ id: string; name: string; display_name: string }>;
  const agentMap = new Map(agentList.map(a => [a.id, a]));

  // For non-admin, get scoped contract IDs
  const scopedContractIds: string[] | null = user.isSuperAdmin
    ? null
    : (participantContracts || []).map(p => p.contract_id);

  // Build filtered messages query
  let query = db
    .from('messages')
    // requires_action / consumes_turn are persisted per message and were not
    // even fetched here, so the cross-contract inbox could not say which of
    // these were asking for anything.
    .select('id, contract_id, sender_id, message_type, content, created_at, requires_action, consumes_turn')
    .order('created_at', { ascending: false })
    // Fetch one extra row to show Next without an expensive total-count query.
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
  // Resolve ALL sender names (not just owned agents) so counterparties don't show as "Unknown"
  const missingSenderIds = [...new Set((messages || []).map(m => m.sender_id))].filter(id => !agentMap.has(id));
  const [{ data: contracts }, { data: extraAgents }] = await Promise.all([
    contractIds.length > 0
      ? db.from('contracts').select('id, title').in('id', contractIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
    missingSenderIds.length > 0
      ? db.from('agents').select('id, name, display_name').in('id', missingSenderIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; display_name: string }> }),
  ]);
  const contractMap = new Map((contracts || []).map(c => [c.id, c]));
  for (const agent of extraAgents || []) {
    agentMap.set(agent.id, agent);
  }

  const hasMore = (messages || []).length > PAGE_SIZE;
  const allMessages = (messages || []).slice(0, PAGE_SIZE);

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
        <div className={styles.list}>
          {allMessages.length === 0 ? (
            <EmptyState
              icon={<MessageSquare size={20} />}
              title={page > 1 ? 'No more messages' : 'No messages found'}
              hint={page > 1 ? 'Go back to a newer page of the stream.' : 'No message matches the current filters. Widen them to see more of the stream.'}
            />
          ) : (
            <div>
              {allMessages.map((msg) => {
                const sender = agentMap.get(msg.sender_id);
                const contract = contractMap.get(msg.contract_id);
                const senderName = sender?.display_name || 'Unknown';
                const preview = extractMessagePreview(msg.content);

                return (
                  <Link
                    key={msg.id}
                    href={`/contracts/${msg.contract_id}`}
                    className={styles.item}
                  >
                    <Avatar name={senderName} size={36} />

                    <div className={styles.content}>
                      <div className={styles.meta}>
                        <strong className={styles.sender}>{senderName}</strong>
                        <StatusBadge domain="message-type" status={msg.message_type} dot="none" size="sm" />
                        {msg.consumes_turn === false ? (
                          <StatusBadge status={null} label="no reply needed" tone="neutral" dot="none" size="sm" />
                        ) : msg.requires_action === false ? (
                          <StatusBadge status={null} label="informational" tone="neutral" dot="none" size="sm" />
                        ) : (
                          <StatusBadge status={null} label="reply expected" tone="peri" dot="none" size="sm" />
                        )}
                      </div>
                      <div className={styles.preview}><CompactMarkdownPreview content={preview} /></div>
                      <div className={styles.context}>{contract?.title || `Contract ${msg.contract_id.slice(0, 8)}`}</div>
                    </div>

                    <div className={styles.end}>
                      <time dateTime={msg.created_at} title={msg.created_at}>{timeAgo(msg.created_at)}</time>
                      <ChevronRight size={15} aria-hidden="true" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
        {(page > 1 || hasMore) && (
          <nav aria-label="Message pages" className="row gap-3" style={{ justifyContent: 'center', alignItems: 'center', marginTop: 'var(--space-5)' }}>
            {page > 1 && <Link className="btn btn--sm" href={pageUrl(page - 1)}>Newer messages</Link>}
            <span className="dim mono text-xs">Page {page}</span>
            {hasMore && <Link className="btn btn--sm" href={pageUrl(page + 1)}>Older messages</Link>}
          </nav>
        )}
      </PageFrame>
    </AutoRefresh>
  );
}
