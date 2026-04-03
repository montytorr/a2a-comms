'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { formatDateTime } from '@/lib/format-date';

type EventType = 'message' | 'contract' | 'audit';

interface FeedEvent {
  id: string;
  type: EventType;
  timestamp: string;
  actor: string;
  summary: string;
  link?: string;
  isNew?: boolean;
}

interface FeedClientProps {
  isSuperAdmin: boolean;
  agentIds: string[];
  agentNames: string[];
  contractIds: string[];
}

const eventTypeConfig: Record<EventType, { bg: string; text: string; dot: string; label: string }> = {
  message: {
    bg: 'bg-cyan-500/[0.08]',
    text: 'text-cyan-400',
    dot: 'bg-cyan-400',
    label: 'Message',
  },
  contract: {
    bg: 'bg-violet-500/[0.08]',
    text: 'text-violet-400',
    dot: 'bg-violet-400',
    label: 'Contract',
  },
  audit: {
    bg: 'bg-emerald-500/[0.08]',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
    label: 'Audit',
  },
};

const PAGE_SIZE = 50;

function formatTime(dateStr: string): string {
  return formatDateTime(dateStr);
}

function truncate(str: string, max: number): string {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max) + '…';
}

export default function FeedClient({ isSuperAdmin, agentNames, contractIds }: FeedClientProps) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const pausedRef = useRef(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(null);

  const hasAccess = isSuperAdmin || contractIds.length > 0;

  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createBrowserClient();
    }
    return supabaseRef.current;
  }, []);

  const auditToEvent = useCallback((row: Record<string, unknown>): FeedEvent => ({
    id: `audit-${row.id}`,
    type: 'audit',
    timestamp: row.created_at as string,
    actor: (row.actor as string) || 'system',
    summary: `${row.action}${row.resource_type ? ` on ${row.resource_type}` : ''}${row.resource_id ? ` (${String(row.resource_id).slice(0, 8)}…)` : ''}`,
    link: row.resource_type === 'contract' && row.resource_id ? `/contracts/${row.resource_id}` : '/audit',
  }), []);

  const messageToEvent = useCallback((row: Record<string, unknown>): FeedEvent => {
    const content = row.content;
    const sender = row.sender as Record<string, unknown> | null;
    const contentStr = typeof content === 'object' && content !== null
      ? ((content as Record<string, unknown>).summary as string || JSON.stringify(content))
      : String(content || '');
    const senderName = sender?.display_name as string || sender?.name as string || String(row.sender_id || '').slice(0, 8) || 'unknown';
    return {
      id: `msg-${row.id}`,
      type: 'message',
      timestamp: row.created_at as string,
      actor: senderName,
      summary: `Message: ${truncate(contentStr, 120)}`,
      link: row.contract_id ? `/contracts/${row.contract_id}` : undefined,
    };
  }, []);

  const contractToEvent = useCallback((row: Record<string, unknown>, eventType: string): FeedEvent => {
    const proposer = row.proposer as Record<string, unknown> | null;
    return {
      id: `contract-${row.id}-${Date.now()}`,
      type: 'contract',
      timestamp: (row.updated_at || row.created_at) as string,
      actor: (proposer?.display_name as string) || (proposer?.name as string) || 'system',
      summary: `Contract "${row.title}" ${eventType === 'INSERT' ? 'created' : 'updated'} — ${row.status}`,
      link: `/contracts/${row.id}`,
    };
  }, []);

  const loadHistory = useCallback(async (pageNum: number) => {
    if (!hasAccess) return [];

    const supabase = getSupabase();
    const from = pageNum * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // Build scoped queries
    let auditQuery = supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    let messagesQuery = supabase
      .from('messages')
      .select('*, sender:agents!messages_sender_id_fkey(name, display_name)')
      .order('created_at', { ascending: false })
      .range(from, to);

    let contractsQuery = supabase
      .from('contracts')
      .select('*, proposer:agents!contracts_proposer_id_fkey(name, display_name)')
      .order('updated_at', { ascending: false })
      .range(from, to);

    // Scope for non-admin users
    if (!isSuperAdmin) {
      if (contractIds.length > 0) {
        messagesQuery = messagesQuery.in('contract_id', contractIds);
        contractsQuery = contractsQuery.in('id', contractIds);
      } else {
        // No contracts — no messages or contracts to show
        messagesQuery = messagesQuery.eq('contract_id', '00000000-0000-0000-0000-000000000000');
        contractsQuery = contractsQuery.eq('id', '00000000-0000-0000-0000-000000000000');
      }

      if (agentNames.length > 0) {
        auditQuery = auditQuery.in('actor', agentNames);
      } else {
        auditQuery = auditQuery.eq('actor', '__none__');
      }
    }

    const [auditRes, messagesRes, contractsRes] = await Promise.all([
      auditQuery,
      messagesQuery,
      contractsQuery,
    ]);

    const newEvents: FeedEvent[] = [];

    for (const row of auditRes.data || []) {
      newEvents.push(auditToEvent(row));
    }
    for (const row of messagesRes.data || []) {
      newEvents.push(messageToEvent(row));
    }
    for (const row of contractsRes.data || []) {
      newEvents.push(contractToEvent(row, 'UPDATE'));
    }

    newEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const totalFetched = (auditRes.data?.length || 0) + (messagesRes.data?.length || 0) + (contractsRes.data?.length || 0);
    if (totalFetched < PAGE_SIZE) {
      setHasMore(false);
    }

    return newEvents;
  }, [getSupabase, auditToEvent, messageToEvent, contractToEvent, isSuperAdmin, contractIds, agentNames, hasAccess]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const history = await loadHistory(0);
      setEvents(history);
      setPage(1);
      setLoading(false);
    })();
  }, [loadHistory]);

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    const moreEvents = await loadHistory(page);
    setEvents(prev => {
      const existingIds = new Set(prev.map(e => e.id));
      const unique = moreEvents.filter(e => !existingIds.has(e.id));
      return [...prev, ...unique];
    });
    setPage(p => p + 1);
    setLoadingMore(false);
  }, [page, loadHistory]);

  const addEvent = useCallback((event: FeedEvent) => {
    if (pausedRef.current) return;
    setEvents((prev) => {
      if (prev.some(e => e.id === event.id)) return prev;
      return [{ ...event, isNew: true }, ...prev];
    });
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Realtime — filter events client-side for non-admins
  useEffect(() => {
    const supabase = getSupabase();

    const channel = supabase
      .channel('realtime-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          // Scope: only show messages from user's contracts
          if (!isSuperAdmin && !contractIds.includes(row.contract_id as string)) return;
          const contentStr = typeof row.content === 'object'
            ? JSON.stringify(row.content)
            : String(row.content || '');
          addEvent({
            id: `msg-${row.id}`,
            type: 'message',
            timestamp: row.created_at as string,
            actor: String(row.sender_id || '').slice(0, 8) || 'unknown',
            summary: `New message in contract — ${truncate(contentStr, 120)}`,
            link: row.contract_id ? `/contracts/${row.contract_id}` : undefined,
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contracts' },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          // Scope: only show user's contracts
          if (!isSuperAdmin && !contractIds.includes(row.id as string)) return;
          const eventName = payload.eventType === 'INSERT' ? 'created' : 'updated';
          addEvent({
            id: `contract-${row.id}-${Date.now()}`,
            type: 'contract',
            timestamp: (row.updated_at || row.created_at) as string,
            actor: String(row.proposer_id || '').slice(0, 8) || 'system',
            summary: `Contract "${row.title}" ${eventName} — status: ${row.status}`,
            link: `/contracts/${row.id}`,
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_log' },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          // Scope: only show audit for user's agents
          if (!isSuperAdmin && !agentNames.includes(row.actor as string)) return;
          addEvent({
            id: `audit-${row.id}`,
            type: 'audit',
            timestamp: row.created_at as string,
            actor: (row.actor as string) || 'system',
            summary: `${row.action}${row.resource_type ? ` on ${row.resource_type}` : ''}`,
            link: '/audit',
          });
        }
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [addEvent, getSupabase, isSuperAdmin, contractIds, agentNames]);

  return (
    <div className="p-4 sm:p-6 lg:p-10">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <p className="text-[10px] font-semibold text-cyan-500/60 uppercase tracking-[0.25em] mb-2">Live</p>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[32px] font-bold text-white tracking-tight">Real-Time Feed</h1>
            <p className="text-sm text-gray-600 mt-1">
              <span className="text-gray-400 font-medium tabular-nums">{events.length}</span> events
              {!isSuperAdmin && (
                <span className="text-gray-700 ml-2">· scoped to your agents</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                {connected && (
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-30" />
                )}
              </div>
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
                {connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            <button
              onClick={() => setPaused((p) => !p)}
              className={`px-3.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200 border ${
                paused
                  ? 'text-cyan-400 bg-cyan-500/[0.08] border-cyan-500/20 hover:bg-cyan-500/[0.12]'
                  : 'text-gray-500 bg-white/[0.02] border-white/[0.04] hover:text-gray-300 hover:bg-white/[0.04]'
              }`}
            >
              {paused ? (
                <span className="flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Resume
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                  Pause
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {isSuperAdmin && (
        <div className="mb-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/15 px-4 py-2.5 flex items-center gap-2 animate-fade-in">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400 shrink-0">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span className="text-[11px] text-amber-400/80 font-medium">
            Admin view — showing all platform events.
          </span>
        </div>
      )}

      {/* Feed */}
      <div className="rounded-2xl glass-card overflow-hidden animate-fade-in" style={{ animationDelay: '0.05s' }}>
        {loading ? (
          <div className="py-20 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.04] mb-4">
              <div className="w-6 h-6 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 animate-spin" />
            </div>
            <p className="text-sm text-gray-600 font-medium">Loading events…</p>
          </div>
        ) : events.length === 0 ? (
          <div className="py-20 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.04] mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-600" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <p className="text-sm text-gray-600 font-medium">No events yet</p>
            <p className="text-[11px] text-gray-700 mt-1">
              {connected ? 'Listening for real-time changes' : 'Connecting to Supabase Realtime…'}
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-white/[0.03]">
              {events.map((ev) => {
                const config = eventTypeConfig[ev.type];
                return ev.link ? (
                  <Link
                    key={ev.id}
                    href={ev.link}
                    className={`block px-6 py-4 hover:bg-white/[0.015] transition-all duration-200 cursor-pointer group ${ev.isNew ? 'animate-fade-in' : ''}`}
                    style={ev.isNew ? { animationDelay: '0s' } : undefined}
                  >
                    <div className="flex items-start gap-4">
                      <span className={`inline-flex items-center justify-center gap-1.5 min-w-[86px] px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase shrink-0 mt-0.5 ${config.bg} ${config.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                        {config.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[12px] font-semibold text-gray-300">{ev.actor}</span>
                          <span className="text-[10px] text-gray-700 font-mono tabular-nums">{formatTime(ev.timestamp)}</span>
                          {ev.isNew && (
                            <span className="text-[9px] font-bold text-cyan-400 bg-cyan-500/[0.1] px-1.5 py-0.5 rounded-full">NEW</span>
                          )}
                        </div>
                        <p className="text-[12px] text-gray-500 leading-relaxed group-hover:text-gray-400 transition-colors">
                          {ev.summary}
                        </p>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700 group-hover:text-cyan-400 transition-colors shrink-0 mt-1">
                        <path d="M5 12h14" />
                        <path d="M12 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                ) : (
                  <div
                    key={ev.id}
                    className={`px-6 py-4 hover:bg-white/[0.015] transition-all duration-200 ${ev.isNew ? 'animate-fade-in' : ''}`}
                    style={ev.isNew ? { animationDelay: '0s' } : undefined}
                  >
                    <div className="flex items-start gap-4">
                      <span className={`inline-flex items-center justify-center gap-1.5 min-w-[86px] px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase shrink-0 mt-0.5 ${config.bg} ${config.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                        {config.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[12px] font-semibold text-gray-300">{ev.actor}</span>
                          <span className="text-[10px] text-gray-700 font-mono tabular-nums">{formatTime(ev.timestamp)}</span>
                          {ev.isNew && (
                            <span className="text-[9px] font-bold text-cyan-400 bg-cyan-500/[0.1] px-1.5 py-0.5 rounded-full">NEW</span>
                          )}
                        </div>
                        <p className="text-[12px] text-gray-500 leading-relaxed">{ev.summary}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div className="px-6 py-4 border-t border-white/[0.04] text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-6 py-2.5 rounded-xl text-[12px] font-semibold text-gray-500 border border-white/[0.06] hover:text-gray-300 hover:bg-white/[0.03] hover:border-white/[0.1] transition-all duration-200 disabled:opacity-50"
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 rounded-full border-gray-600 border-t-gray-400 animate-spin" />
                      Loading…
                    </span>
                  ) : (
                    'Load More'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
