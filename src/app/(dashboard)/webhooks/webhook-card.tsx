'use client';

import { useState, useTransition } from 'react';
import { testWebhook, updateWebhook, deleteWebhook, getDeliveries, type WebhookTestResult, type WebhookDelivery } from './actions';
import { formatDate } from '@/lib/format-date';
import { CANONICAL_WEBHOOK_EVENTS } from '@/lib/webhook-events';

const ALL_EVENTS = CANONICAL_WEBHOOK_EVENTS;

interface WebhookCardProps {
  webhook: {
    id: string;
    url: string;
    events: string[];
    is_active: boolean;
    failure_count: number;
    created_at: string;
    updated_at: string;
    last_delivery_at: string | null;
  };
  animationDelay: string;
}

function truncateUrl(url: string, max = 60): string {
  if (url.length <= max) return url;
  return url.slice(0, max) + '…';
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatDate(dateStr);
}

export default function WebhookCard({ webhook: wh, animationDelay }: WebhookCardProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [editUrl, setEditUrl] = useState(wh.url);
  const [editEvents, setEditEvents] = useState<string[]>([...wh.events]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const result = await testWebhook(wh.id);
    setTestResult(result);
    setTesting(false);
  }

  function toggleEvent(ev: string) {
    setEditEvents(prev =>
      prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]
    );
  }

  function handleSave() {
    if (editEvents.length === 0) {
      setError('At least one event required');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateWebhook(wh.id, {
        url: editUrl !== wh.url ? editUrl : undefined,
        events: JSON.stringify(editEvents) !== JSON.stringify(wh.events) ? editEvents : undefined,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setEditing(false);
      }
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      const result = await updateWebhook(wh.id, { is_active: !wh.is_active });
      if (result.error) setError(result.error);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteWebhook(wh.id);
      if (result.error) setError(result.error);
      setConfirmDelete(false);
    });
  }

  return (
    <div
      className="rounded-2xl glass-card overflow-hidden animate-fade-in"
      style={{ animationDelay }}
    >
      <div className={`h-px bg-gradient-to-r from-transparent ${wh.is_active ? 'via-cyan-500/30' : 'via-gray-600/20'} to-transparent`} />

      <div className="p-5">
        {error && (
          <div className="mb-3 p-2 rounded-lg bg-red-500/[0.06] border border-red-500/10 text-[11px] text-red-400">
            {error}
          </div>
        )}

        {/* URL + Status row */}
        <div className="flex items-start gap-3 mb-4">
          <div className="mt-1.5 shrink-0 relative">
            <div className={`w-2 h-2 rounded-full ${wh.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {wh.is_active && (
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-30" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                type="url"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                className="w-full bg-[#0a0a10] border border-white/[0.08] rounded-lg px-3 py-1.5 text-[13px] text-gray-200 font-mono focus:outline-none focus:border-cyan-500/30"
              />
            ) : (
              <p className="text-[13px] font-mono text-gray-300 truncate" title={wh.url}>
                {truncateUrl(wh.url, 60)}
              </p>
            )}
            <p className="text-[10px] text-gray-700 mt-0.5">
              {wh.is_active ? 'Active' : 'Inactive'}
              {wh.failure_count > 0 && (
                <span className="text-amber-500 ml-2">
                  · {wh.failure_count} consecutive failure{wh.failure_count !== 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {!editing && (
              <>
                <button
                  onClick={handleTest}
                  disabled={testing || isPending}
                  className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-white/[0.08] text-gray-400 hover:text-cyan-400 hover:border-cyan-500/20 hover:bg-cyan-500/[0.06] transition-all duration-200 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {testing ? (
                    <>
                      <span className="w-3 h-3 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                      Testing…
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 2L11 13" />
                        <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                      </svg>
                      Test
                    </>
                  )}
                </button>
                <button
                  onClick={() => { setEditing(true); setEditUrl(wh.url); setEditEvents([...wh.events]); }}
                  className="p-1.5 rounded-lg border border-white/[0.06] text-gray-500 hover:text-cyan-400 hover:border-cyan-500/20 hover:bg-cyan-500/[0.06] transition-all duration-200"
                  title="Edit"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  onClick={handleToggleActive}
                  disabled={isPending}
                  className={`p-1.5 rounded-lg border transition-all duration-200 ${
                    wh.is_active
                      ? 'border-white/[0.06] text-gray-500 hover:text-amber-400 hover:border-amber-500/20 hover:bg-amber-500/[0.06]'
                      : 'border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/[0.06]'
                  }`}
                  title={wh.is_active ? 'Disable' : 'Enable'}
                >
                  {wh.is_active ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-1.5 rounded-lg border border-white/[0.06] text-gray-500 hover:text-red-400 hover:border-red-500/20 hover:bg-red-500/[0.06] transition-all duration-200"
                  title="Delete"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </>
            )}
            {editing && (
              <>
                <button
                  onClick={handleSave}
                  disabled={isPending}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all disabled:opacity-50"
                >
                  {isPending ? '…' : 'Save'}
                </button>
                <button
                  onClick={() => { setEditing(false); setError(null); }}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-gray-500 border border-white/[0.06] hover:text-gray-300 transition-all"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Delete confirmation */}
        {confirmDelete && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/[0.06] border border-red-500/15 flex items-center justify-between">
            <span className="text-[12px] text-red-400 font-medium">Delete this webhook?</span>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-all disabled:opacity-50"
              >
                {isPending ? '…' : 'Delete'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1 rounded-lg text-[11px] font-semibold text-gray-500 border border-white/[0.06] hover:text-gray-300 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Test result */}
        {testResult && (
          <div className={`mb-4 rounded-lg px-3 py-2.5 flex items-center gap-2 text-[11px] font-medium ${
            testResult.success
              ? 'bg-emerald-500/[0.06] border border-emerald-500/15 text-emerald-400'
              : 'bg-red-500/[0.06] border border-red-500/15 text-red-400'
          }`}>
            {testResult.success ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            )}
            <span>
              {testResult.success
                ? `OK — ${testResult.status} ${testResult.statusText}`
                : testResult.error
                  ? `Failed — ${testResult.error}`
                  : `Failed — ${testResult.status} ${testResult.statusText}`}
            </span>
            {testResult.responseTime !== undefined && (
              <span className="text-gray-600 ml-auto font-mono tabular-nums">{testResult.responseTime}ms</span>
            )}
          </div>
        )}

        {/* Event badges (editable when editing) */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {editing ? (
            ALL_EVENTS.map((ev) => (
              <button
                key={ev}
                type="button"
                onClick={() => toggleEvent(ev)}
                className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-full border transition-all duration-200 ${
                  editEvents.includes(ev)
                    ? 'text-cyan-400 bg-cyan-500/[0.08] border-cyan-500/[0.12]'
                    : 'text-gray-600 bg-white/[0.02] border-white/[0.04] hover:text-gray-400'
                }`}
              >
                {editEvents.includes(ev) && '✓ '}{ev}
              </button>
            ))
          ) : (
            wh.events.map((event) => (
              <span
                key={event}
                className="text-[10px] font-mono font-medium text-cyan-400 bg-cyan-500/[0.08] border border-cyan-500/[0.12] px-2 py-0.5 rounded-full"
              >
                {event}
              </span>
            ))
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-6 pt-3 border-t border-white/[0.04]">
          <div>
            <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-0.5">Last Delivery</p>
            <span className="text-[12px] text-gray-400 font-mono tabular-nums">
              {wh.last_delivery_at ? timeAgo(wh.last_delivery_at) : 'Never'}
            </span>
          </div>
          <div>
            <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-0.5">Created</p>
            <span className="text-[12px] text-gray-400 font-mono tabular-nums">
              {formatDate(wh.created_at)}
            </span>
          </div>
          <div>
            <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-0.5">Updated</p>
            <span className="text-[12px] text-gray-400 font-mono tabular-nums">
              {formatDate(wh.updated_at)}
            </span>
          </div>
          {wh.failure_count > 0 && (
            <div>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-0.5">Consecutive Fails</p>
              <span className="text-[12px] text-amber-400 font-mono font-semibold tabular-nums">
                {wh.failure_count}
                <span className="text-[10px] text-gray-600 font-normal ml-1">/ 10 to auto-disable</span>
              </span>
            </div>
          )}
        </div>

        {/* Recent Deliveries */}
        <div className="mt-4 pt-3 border-t border-white/[0.04]">
          <button
            onClick={async () => {
              if (!showDeliveries && deliveries.length === 0) {
                setDeliveriesLoading(true);
                const result = await getDeliveries(wh.id);
                setDeliveries(result.data);
                setDeliveriesLoading(false);
              }
              setShowDeliveries(!showDeliveries);
            }}
            className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-gray-600 hover:text-gray-400 transition-colors duration-200 uppercase tracking-wider"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-200 ${showDeliveries ? 'rotate-90' : ''}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            {deliveriesLoading ? 'Loading…' : `Recent Deliveries${deliveries.length > 0 ? ` (${deliveries.length})` : ''}`}
          </button>

          {showDeliveries && deliveries.length > 0 && (() => {
            const successCount = deliveries.filter(d => d.status === 'success').length;
            const failedCount = deliveries.filter(d => d.status === 'failed').length;
            return (
              <div className="mt-3 space-y-1 animate-fade-in" style={{ animationDuration: '0.15s' }}>
                {/* Summary bar */}
                <div className="flex items-center gap-4 px-3 py-2 mb-1 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <span className="text-[10px] text-gray-500">Last {deliveries.length} deliveries:</span>
                  <span className="text-[10px] font-semibold text-emerald-400">{successCount} OK</span>
                  {failedCount > 0 && <span className="text-[10px] font-semibold text-red-400">{failedCount} failed</span>}
                  {deliveries.filter(d => d.status === 'retrying').length > 0 && (
                    <span className="text-[10px] font-semibold text-amber-400">{deliveries.filter(d => d.status === 'retrying').length} retrying</span>
                  )}
                  {deliveries.filter(d => d.status === 'pending').length > 0 && (
                    <span className="text-[10px] font-semibold text-amber-400">{deliveries.filter(d => d.status === 'pending').length} pending</span>
                  )}
                  <span className="text-[10px] text-gray-600 ml-auto font-mono">
                    {Math.round((successCount / deliveries.length) * 100)}% success rate
                  </span>
                </div>

                {/* Header */}
                <div className="grid grid-cols-[1fr_80px_90px_80px_100px] gap-2 px-3 py-1.5">
                  <span className="text-[9px] font-semibold text-gray-700 uppercase tracking-wider">Event</span>
                  <span className="text-[9px] font-semibold text-gray-700 uppercase tracking-wider">Status</span>
                  <span className="text-[9px] font-semibold text-gray-700 uppercase tracking-wider">HTTP</span>
                  <span className="text-[9px] font-semibold text-gray-700 uppercase tracking-wider">Attempts</span>
                  <span className="text-[9px] font-semibold text-gray-700 uppercase tracking-wider text-right">When</span>
                </div>
                {deliveries.map((d) => {
                  const maxRetries = d.max_retries ?? 1;
                  return (
                  <div
                    key={d.id}
                    className={`grid grid-cols-[1fr_80px_90px_80px_100px] gap-2 px-3 py-2 rounded-lg ${
                      d.status === 'failed'
                        ? 'bg-red-500/[0.04] border border-red-500/[0.08]'
                        : d.status === 'success'
                          ? 'bg-white/[0.01] border border-white/[0.03]'
                          : 'bg-amber-500/[0.04] border border-amber-500/[0.08]'
                    }`}
                  >
                    <span className="text-[11px] font-mono text-gray-300 truncate">{d.event}</span>
                    <span className={`text-[11px] font-semibold ${
                      d.status === 'success' ? 'text-emerald-400'
                        : d.status === 'failed' ? 'text-red-400'
                        : d.status === 'retrying' ? 'text-amber-400'
                        : 'text-amber-400'
                    }`}>
                      {d.status === 'success'
                        ? d.attempts > 1 ? `✅ Attempt ${d.attempts}` : '✓ OK'
                        : d.status === 'failed'
                          ? d.attempts > 1 ? `❌ ${d.attempts} tries` : '✗ Failed'
                          : d.status === 'retrying'
                            ? `⏳ Retry ${d.attempts}/${maxRetries}`
                            : '⏳ Pending'}
                    </span>
                    <span className={`text-[11px] font-mono tabular-nums ${
                      d.response_status && d.response_status >= 200 && d.response_status < 300
                        ? 'text-emerald-400'
                        : d.response_status
                          ? 'text-red-400'
                          : d.status === 'failed' ? 'text-red-400/60 italic' : 'text-gray-600'
                    }`}>
                      {d.response_status ? d.response_status : d.status === 'failed' ? 'Network' : '—'}
                    </span>
                    <span className="text-[11px] font-mono text-gray-500 tabular-nums">
                      {d.attempts}/{maxRetries}
                    </span>
                    <span className="text-[10px] font-mono text-gray-600 tabular-nums text-right">
                      {d.delivered_at ? timeAgo(d.delivered_at) : d.created_at ? timeAgo(d.created_at) : '—'}
                    </span>
                  </div>
                  );
                })}
              </div>
            );
          })()}

          {showDeliveries && !deliveriesLoading && deliveries.length === 0 && (
            <p className="mt-2 text-[11px] text-gray-600">No deliveries recorded yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
