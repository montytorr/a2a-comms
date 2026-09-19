'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Pause, Play, Radio } from 'lucide-react';
import { formatDateTime } from '@/lib/format-date';
import { HashChip, SectionHeader, PageFrame, EmptyState } from '@/components/atoms';

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
  const timestamp = (row.updated_at || row.created_at) as string;
  return {
    id: `contract-${row.id}-${timestamp}`,
    type: 'contract',
    timestamp,
    actor: (proposer?.display_name as string) || (proposer?.name as string) || 'system',
    summary: `Contract "${row.title}" ${eventType === 'INSERT' ? 'created' : 'updated'} — ${row.status}`,
    link: id ? `/contracts/${id}` : undefined,
  };
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function FeedClient({ isSuperAdmin, contractIds }: FeedClientProps) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);

  const pausedRef = useRef(false);

  const hasAccess = isSuperAdmin || contractIds.length > 0;

  const loadHistory = useCallback(async (pageNum: number) => {
    if (!hasAccess) return [];

    const response = await fetch(`/api/internal/feed-history?page=${pageNum}`, { cache: 'no-store' });
    if (!response.ok) {
      setConnected(false);
      return [];
    }
    const payload = await response.json();
    setConnected(true);

    const newEvents: FeedEvent[] = [];
    for (const row of payload.audit || []) newEvents.push(auditToEvent(row));
    for (const row of payload.messages || []) newEvents.push(messageToEvent(row));
    for (const row of payload.contracts || []) newEvents.push(contractToEvent(row, 'UPDATE'));

    newEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return newEvents;
  }, [hasAccess]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const history = await loadHistory(0);
      if (!cancelled) {
        setEvents(history);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadHistory]);

  const mergeHistory = useCallback((history: FeedEvent[]) => {
    if (pausedRef.current || history.length === 0) return;
    setEvents(prev => {
      const existingIds = new Set(prev.map(e => e.id));
      const unseen = history.filter(e => !existingIds.has(e.id));
      if (unseen.length === 0) return prev;
      const merged = [
        ...unseen.map(e => ({ ...e, isNew: true })),
        ...prev,
      ];
      merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return merged.slice(0, PAGE_SIZE * 3);
    });
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!hasAccess) return;

    const interval = window.setInterval(async () => {
      if (pausedRef.current) return;
      const latest = await loadHistory(0);
      mergeHistory(latest);
    }, 10000);

    return () => window.clearInterval(interval);
  }, [hasAccess, loadHistory, mergeHistory]);

  const togglePause = useCallback(() => setPaused(p => !p), []);

  // ─── Render ───────────────────────────────────────────────────────────────

  const eventTypeCounts = events.reduce<Record<EventType, number>>((acc, event) => {
    acc[event.type] += 1;
    return acc;
  }, { message: 0, contract: 0, audit: 0, task: 0, webhook: 0 });
  const topEventTypes = (Object.entries(eventTypeCounts) as Array<[EventType, number]>)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  const maxTopEventCount = Math.max(1, ...topEventTypes.map(([, count]) => count));

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
    <PageFrame>
      <SectionHeader
        eyebrow="Monitoring · Live"
        title="Live Feed"
        sub="Real-time event stream from the control plane"
        right={headerRight}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16, alignItems: 'start' }}>

        {/* ── Left: event stream ─────────────────────────────────────────── */}
        <div className="card">
          {/* Card header */}
          <div className="row gap-3" style={{
            padding: '10px 16px',
            background: 'var(--bg-2)',
            borderBottom: '1px solid var(--line-1)',
          }}>
            <span className="upper flex-1">Event Stream</span>
            <span className="mono dim text-2xs">{events.length} loaded</span>
            {!loading && (
              <span className={`dot ${connected ? 'dot--mint' : 'dot--rose'}`} title={connected ? 'Connected' : 'Disconnected'} />
            )}
          </div>

          {/* Event list */}
          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '48px 0', textAlign: 'center' }}>
                <span className="dim text-sm">Loading events…</span>
              </div>
            ) : events.length === 0 ? (
              <EmptyState
                icon={<Radio size={20} />}
                title="No events yet"
                hint="The stream is live. Anything the platform does next shows up here."
              />
            ) : (
              events.map((ev) => (
                <EventRow key={ev.id} event={ev} isNew={!!ev.isNew} />
              ))
            )}
          </div>
        </div>

        {/* ── Right column ───────────────────────────────────────────────── */}
        <div className="col gap-3">

          {/* Event counts card */}
          <div className="card" style={{ padding: 'var(--space-4)' }}>
            <div className="upper" style={{ marginBottom: 12 }}>Event Types</div>
            {topEventTypes.length === 0 ? (
              <EmptyState title="No events loaded yet" />
            ) : (
              <div className="col gap-3">
                {topEventTypes.map(([type, count]) => (
                  <div key={type}>
                    <div className="row gap-2" style={{ marginBottom: 5 }}>
                      <span className="mono text-xs" style={{ flex: 1, color: TYPE_COLOR[type] }}>{type}</span>
                      <span className="mono num dim text-xs">{count}</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 999, background: 'var(--bg-3)', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(6, (count / maxTopEventCount) * 100)}%`, height: '100%', background: TYPE_COLOR[type] }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </PageFrame>
  );
}

// ─── EventRow sub-component ───────────────────────────────────────────────────

function EventRow({ event, isNew }: { event: FeedEvent; isNew: boolean }) {
  const ts = formatTime(event.timestamp);
  const Wrapper = event.link ? 'a' : 'div';
  const wrapperProps = event.link ? { href: event.link, style: { textDecoration: 'none', color: 'inherit' } } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={isNew ? 'animate-fade-in' : ''}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 14px',
        borderBottom: '1px solid var(--line-1)',
        background: isNew ? 'color-mix(in oklch, var(--mint) 8%, transparent)' : undefined,
        transition: 'background 0.3s',
        ...(event.link ? { textDecoration: 'none', color: 'inherit', cursor: 'pointer' } : {}),
      }}
    >
      {/* Timestamp */}
      <span
        className="mono num text-2xs"
        style={{ color: 'var(--fg-4)', width: 70, flexShrink: 0, userSelect: 'none' }}
      >
        {ts}
      </span>

      {/* Type dot */}
      <span className={TYPE_DOT[event.type]} style={{ flexShrink: 0 }} />

      {/* Actor */}
      <span
        className="mono truncate-text text-2xs"
        style={{ color: 'var(--fg-3)', width: 90, flexShrink: 0 }}
        title={event.actor}
      >
        {event.actor}
      </span>

      {/* Summary */}
      <span
        className="truncate-text text-xs"
        style={{ flex: 1, color: 'var(--fg-2)' }}
        title={event.summary}
      >
        {event.summary}
      </span>

      {/* Hash chip */}
      <HashChip value={event.id} copyable={false} />
    </Wrapper>
  );
}
