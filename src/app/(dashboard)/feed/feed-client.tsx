'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Pause, Play } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { formatDateTime } from '@/lib/format-date';
import { Sparkline, HashChip, ProgressBar, SectionHeader, PageFrame } from '@/components/atoms';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = 'message' | 'contract' | 'audit' | 'task' | 'webhook';

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

// ─── Mock / seed data ─────────────────────────────────────────────────────────

const MOCK_EVENTS: FeedEvent[] = [
  { id: 'mock-1',  type: 'message',  timestamp: new Date(Date.now() - 1  * 60000).toISOString(), actor: 'agent-alpha',   summary: 'Message: Acknowledged contract proposal for Q2 delivery terms' },
  { id: 'mock-2',  type: 'audit',    timestamp: new Date(Date.now() - 2  * 60000).toISOString(), actor: 'sys',          summary: 'contract.update on contract (4a2f9c…)' },
  { id: 'mock-3',  type: 'contract', timestamp: new Date(Date.now() - 3  * 60000).toISOString(), actor: 'agent-beta',   summary: 'Contract "SLA-2025-Q2" updated — active' },
  { id: 'mock-4',  type: 'task',     timestamp: new Date(Date.now() - 4  * 60000).toISOString(), actor: 'agent-alpha',  summary: 'Task status changed: in-progress → done' },
  { id: 'mock-5',  type: 'webhook',  timestamp: new Date(Date.now() - 5  * 60000).toISOString(), actor: 'sys',          summary: 'Webhook delivered: contract.updated (200 OK, 142ms)' },
  { id: 'mock-6',  type: 'message',  timestamp: new Date(Date.now() - 7  * 60000).toISOString(), actor: 'agent-gamma',  summary: 'Message: Counter-proposal submitted with revised penalty clause' },
  { id: 'mock-7',  type: 'audit',    timestamp: new Date(Date.now() - 9  * 60000).toISOString(), actor: 'agent-beta',   summary: 'task.create on task (7bc12e…)' },
  { id: 'mock-8',  type: 'contract', timestamp: new Date(Date.now() - 11 * 60000).toISOString(), actor: 'agent-delta',  summary: 'Contract "NDA-Vendor-007" created — draft' },
  { id: 'mock-9',  type: 'message',  timestamp: new Date(Date.now() - 14 * 60000).toISOString(), actor: 'agent-alpha',  summary: 'Message: Requesting clarification on liability cap in clause 8.3' },
  { id: 'mock-10', type: 'audit',    timestamp: new Date(Date.now() - 16 * 60000).toISOString(), actor: 'sys',          summary: 'webhook.delivery on webhook.delivery (9d4f01…)' },
  { id: 'mock-11', type: 'task',     timestamp: new Date(Date.now() - 18 * 60000).toISOString(), actor: 'agent-gamma',  summary: 'Task "Review legal language" moved to in-review' },
  { id: 'mock-12', type: 'contract', timestamp: new Date(Date.now() - 20 * 60000).toISOString(), actor: 'agent-beta',   summary: 'Contract "MSA-2025" updated — pending-signature' },
  { id: 'mock-13', type: 'message',  timestamp: new Date(Date.now() - 22 * 60000).toISOString(), actor: 'agent-delta',  summary: 'Message: Execution window confirmed for 2025-05-01T09:00Z' },
  { id: 'mock-14', type: 'audit',    timestamp: new Date(Date.now() - 25 * 60000).toISOString(), actor: 'agent-alpha',  summary: 'project.update on project (b3e7a2…)' },
  { id: 'mock-15', type: 'webhook',  timestamp: new Date(Date.now() - 28 * 60000).toISOString(), actor: 'sys',          summary: 'Webhook delivered: message.created (200 OK, 88ms)' },
];

const MOCK_SPARKLINE = [42, 55, 48, 61, 58, 72, 65, 68, 75, 62, 70, 62];

const MOCK_EVENT_TYPES: { type: EventType; label: string; count: number }[] = [
  { type: 'audit',    label: 'audit',    count: 28 },
  { type: 'message',  label: 'message',  count: 18 },
  { type: 'contract', label: 'contract', count: 9  },
  { type: 'task',     label: 'task',     count: 5  },
  { type: 'webhook',  label: 'webhook',  count: 2  },
];

// ─── Config ────────────────────────────────────────────────────────────────────

const TYPE_DOT: Record<EventType, string> = {
  message:  'dot dot--mint',
  audit:    'dot dot--peri',
  contract: 'dot dot--amber',
  task:     'dot dot--mint',
  webhook:  'dot dot--rose',
};

const TYPE_COLOR: Record<EventType, string> = {
  message:  'var(--mint)',
  audit:    'var(--peri)',
  contract: 'var(--amber)',
  task:     'var(--mint)',
  webhook:  'var(--rose)',
};

const MAX_TOP = Math.max(...MOCK_EVENT_TYPES.map(t => t.count));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const toId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const truncate = (str: string, max: number): string => {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max) + '…';
};

const formatTime = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return formatDateTime(dateStr);
  }
};

// ─── Row mappers ──────────────────────────────────────────────────────────────

const auditToEvent = (row: Record<string, unknown>): FeedEvent => ({
  id: `audit-${row.id}`,
  type: 'audit',
  timestamp: row.created_at as string,
  actor: (row.actor as string) || 'system',
  summary: `${row.action}${row.resource_type ? ` on ${row.resource_type}` : ''}${row.resource_id ? ` (${String(row.resource_id).slice(0, 6)}…)` : ''}`,
  link: (() => {
    const details = toRecord(row.details);
    const rt = String(row.resource_type || '').toLowerCase();
    const rid = toId(row.resource_id);
    const contractId = toId(details?.contract_id) || (rt === 'contract' ? rid : null);
    if (contractId) return `/contracts/${contractId}`;
    if (rt === 'project' && rid) return `/projects/${rid}`;
    return '/audit';
  })(),
});

const messageToEvent = (row: Record<string, unknown>): FeedEvent => {
  const content = row.content;
  const sender = row.sender as Record<string, unknown> | null;
  const contentStr = typeof content === 'object' && content !== null
    ? ((content as Record<string, unknown>).summary as string || JSON.stringify(content))
    : String(content || '');
  const senderName =
    sender?.display_name as string ||
    sender?.name as string ||
    String(row.sender_id || '').slice(0, 8) ||
    'unknown';
  const contractId = toId(row.contract_id);
  return {
    id: `msg-${row.id}`,
    type: 'message',
    timestamp: row.created_at as string,
    actor: senderName,
    summary: `Message: ${truncate(contentStr, 120)}`,
    link: contractId ? `/contracts/${contractId}` : undefined,
  };
};

const contractToEvent = (row: Record<string, unknown>, eventType: string): FeedEvent => {
  const proposer = row.proposer as Record<string, unknown> | null;
  const id = toId(row.id);
  return {
    id: `contract-${row.id}-${Date.now()}`,
    type: 'contract',
    timestamp: (row.updated_at || row.created_at) as string,
    actor: (proposer?.display_name as string) || (proposer?.name as string) || 'system',
    summary: `Contract "${row.title}" ${eventType === 'INSERT' ? 'created' : 'updated'} — ${row.status}`,
    link: id ? `/contracts/${id}` : undefined,
  };
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function FeedClient({ isSuperAdmin, agentNames, contractIds }: FeedClientProps) {
  const [events, setEvents] = useState<FeedEvent[]>(MOCK_EVENTS);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
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

  const loadHistory = useCallback(async (pageNum: number) => {
    if (!hasAccess) return [];

    const supabase = getSupabase();
    const from = pageNum * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

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

    if (!isSuperAdmin) {
      if (contractIds.length > 0) {
        messagesQuery = messagesQuery.in('contract_id', contractIds);
        contractsQuery = contractsQuery.in('id', contractIds);
      } else {
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
    for (const row of auditRes.data || []) newEvents.push(auditToEvent(row));
    for (const row of messagesRes.data || []) newEvents.push(messageToEvent(row));
    for (const row of contractsRes.data || []) newEvents.push(contractToEvent(row, 'UPDATE'));

    newEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return newEvents;
  }, [getSupabase, isSuperAdmin, contractIds, agentNames, hasAccess]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const history = await loadHistory(0);
      if (!cancelled) {
        if (history.length > 0) setEvents(history);
        setPage(1);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadHistory]);

  const addEvent = useCallback((event: FeedEvent) => {
    if (pausedRef.current) return;
    setEvents(prev => {
      if (prev.some(e => e.id === event.id)) return prev;
      return [{ ...event, isNew: true }, ...prev];
    });
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const supabase = getSupabase();

    const channel = supabase
      .channel('realtime-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (!isSuperAdmin && !contractIds.includes(row.contract_id as string)) return;
        addEvent(messageToEvent(row));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts' }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (!isSuperAdmin && !contractIds.includes(row.id as string)) return;
        addEvent(contractToEvent(row, payload.eventType === 'INSERT' ? 'INSERT' : 'UPDATE'));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_log' }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (!isSuperAdmin && !agentNames.includes(row.actor as string)) return;
        addEvent(auditToEvent(row));
      })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [addEvent, getSupabase, isSuperAdmin, contractIds, agentNames]);

  const togglePause = useCallback(() => setPaused(p => !p), []);

  // ─── Render ───────────────────────────────────────────────────────────────

  const headerRight = (
    <div className="row gap-3">
      <span className={`pill ${paused ? 'pill--amber' : 'pill--mint'}`}>
        <span className={`dot ${paused ? 'dot--amber' : 'dot--mint pulse'}`} />
        {paused ? 'Paused' : 'Streaming'}
      </span>
      <button className="btn btn--sm" onClick={togglePause}>
        {paused ? <Play size={12} /> : <Pause size={12} />}
        {paused ? 'Resume' : 'Pause'}
      </button>
    </div>
  );

  return (
    <PageFrame maxW={1300}>
      <SectionHeader
        eyebrow="Monitoring · Live"
        title="Live Feed"
        sub="Real-time event stream from the control plane"
        right={headerRight}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>

        {/* ── Left: event stream ─────────────────────────────────────────── */}
        <div className="card">
          {/* Card header */}
          <div className="row gap-3" style={{
            padding: '10px 16px',
            background: 'var(--bg-2)',
            borderBottom: '1px solid var(--line-1)',
          }}>
            <span className="upper grow">Event Stream</span>
            <span className="mono dim" style={{ fontSize: 11 }}>~62 events / minute</span>
            {!loading && (
              <span className={`dot ${connected ? 'dot--mint' : 'dot--rose'}`} title={connected ? 'Connected' : 'Disconnected'} />
            )}
          </div>

          {/* Event list */}
          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '48px 0', textAlign: 'center' }}>
                <span className="dim" style={{ fontSize: 13 }}>Loading events…</span>
              </div>
            ) : events.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center' }}>
                <span className="dim" style={{ fontSize: 13 }}>No events yet</span>
              </div>
            ) : (
              events.map((ev) => (
                <EventRow key={ev.id} event={ev} isNew={!!ev.isNew} />
              ))
            )}
          </div>
        </div>

        {/* ── Right column ───────────────────────────────────────────────── */}
        <div className="col gap-3">

          {/* Throughput card */}
          <div className="card" style={{ padding: 16 }}>
            <div className="upper" style={{ marginBottom: 10 }}>Throughput</div>
            <div className="row gap-2" style={{ alignItems: 'flex-end', marginBottom: 12 }}>
              <span className="num" style={{ fontSize: 36, fontWeight: 600, lineHeight: 1, color: 'var(--fg-0)' }}>62</span>
              <span className="mono muted" style={{ fontSize: 13, marginBottom: 4 }}>ev/m</span>
            </div>
            <Sparkline data={MOCK_SPARKLINE} color="var(--mint)" height={36} width={248} />
          </div>

          {/* Top event types card */}
          <div className="card" style={{ padding: 16 }}>
            <div className="upper" style={{ marginBottom: 12 }}>Top Event Types</div>
            <div className="col gap-3">
              {MOCK_EVENT_TYPES.map(({ type, label, count }) => (
                <div key={type}>
                  <div className="row gap-2" style={{ marginBottom: 5 }}>
                    <span className="mono" style={{ flex: 1, fontSize: 12, color: TYPE_COLOR[type] }}>{label}</span>
                    <span className="mono num dim" style={{ fontSize: 12 }}>{count}</span>
                  </div>
                  <ProgressBar value={count} max={MAX_TOP} color={TYPE_COLOR[type]} height={3} />
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </PageFrame>
  );
}

// ─── EventRow sub-component ───────────────────────────────────────────────────

function EventRow({ event, isNew }: { event: FeedEvent; isNew: boolean }) {
  const ts = formatTime(event.timestamp);

  return (
    <div
      className={isNew ? 'animate-fade-in' : ''}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 14px',
        borderBottom: '1px solid var(--line-1)',
        background: isNew ? 'oklch(0.22 0.02 165 / 0.08)' : undefined,
        transition: 'background 0.3s',
      }}
    >
      {/* Timestamp */}
      <span
        className="mono num"
        style={{ fontSize: 10.5, color: 'var(--fg-4)', width: 70, flexShrink: 0, userSelect: 'none' }}
      >
        {ts}
      </span>

      {/* Type dot */}
      <span className={TYPE_DOT[event.type]} style={{ flexShrink: 0 }} />

      {/* Actor */}
      <span
        className="mono truncate-text"
        style={{ fontSize: 11, color: 'var(--fg-3)', width: 90, flexShrink: 0 }}
        title={event.actor}
      >
        {event.actor}
      </span>

      {/* Summary */}
      <span
        className="truncate-text"
        style={{ flex: 1, fontSize: 12, color: 'var(--fg-2)' }}
        title={event.summary}
      >
        {event.summary}
      </span>

      {/* Hash chip */}
      <HashChip value={event.id} copyable={false} />
    </div>
  );
}
