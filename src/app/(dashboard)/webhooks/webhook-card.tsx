'use client';

import { useState, useTransition } from 'react';
import { testWebhook, updateWebhook, deleteWebhook, getDeliveries, type WebhookTestResult, type WebhookDelivery } from './actions';
import { formatDate } from '@/lib/format-date';
import { CANONICAL_WEBHOOK_EVENTS } from '@/lib/webhook-events';
import { Send, Edit2, Pause, Play, Trash2, ChevronRight, Check, X } from 'lucide-react';
import {
  colorVarForTone,
  httpStatusTone,
  lineVarForTone,
  statusTone,
  surfaceVarForTone,
} from '@/lib/status-tone';
import type { WebhookDeliveryStatus } from '@/lib/types';
import { EmptyState } from '@/components/atoms';

/** Delivery-status colours come from the shared tone map, so this card cannot
 *  drift from the health page's table or from a status pill. */
const deliveryColor = (status: WebhookDeliveryStatus) =>
  colorVarForTone(statusTone('webhook-delivery', status));


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
    <div className="card animate-fade-in" style={{ animationDelay }}>
      {/* Active state top accent line */}
      <div style={{
        height: 2,
        background: wh.is_active
          ? 'linear-gradient(90deg, transparent, var(--mint-bg), transparent)'
          : 'linear-gradient(90deg, transparent, var(--line-1), transparent)',
      }} />

      <div style={{ padding: '16px 20px' }}>
        {error && (
          <div className="text-xs" style={{
            marginBottom: 12,
            padding: '8px 12px',
            borderRadius: 6,
            background: 'var(--rose-bg)',
            border: '1px solid var(--rose-line)',
            
            color: 'var(--rose)',
          }}>
            {error}
          </div>
        )}

        {/* URL + Status row */}
        <div className="row gap-3" style={{ marginBottom: 16, alignItems: 'flex-start' }}>
          <div style={{ marginTop: 4, flexShrink: 0, position: 'relative' }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: wh.is_active ? 'var(--mint)' : 'var(--rose)',
            }} />
            {wh.is_active && (
              <div style={{
                position: 'absolute',
                inset: 0,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--mint)',
                animation: 'pulse 2s ease-in-out infinite',
                opacity: 0.3,
              }} />
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <input
                type="url"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                className="cp-input mono"
                style={{ height: 32 }}
              />
            ) : (
              <p className="mono text-sm" style={{ color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={wh.url}>
                {truncateUrl(wh.url, 60)}
              </p>
            )}
            <p className="text-2xs" style={{ color: 'var(--fg-4)', marginTop: 2 }}>
              {wh.is_active ? 'Active' : 'Inactive'}
              {wh.failure_count > 0 && (
                <span style={{ color: 'var(--amber)', marginLeft: 8 }}>
                  · {wh.failure_count} consecutive failure{wh.failure_count !== 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>

          {/* Action buttons */}
          <div className="row gap-1" style={{ flexShrink: 0 }}>
            {!editing && (
              <>
                <button
                  onClick={handleTest}
                  disabled={testing || isPending}
                  className="btn btn--sm"
                  style={{ gap: 6 }}
                >
                  {testing ? (
                    <>
                      <span style={{
                        width: 12,
                        height: 12,
                        border: '2px solid var(--line-2)',
                        borderTopColor: 'var(--peri)',
                        borderRadius: '50%',
                        animation: 'spin 0.6s linear infinite',
                        display: 'inline-block',
                      }} />
                      Testing…
                    </>
                  ) : (
                    <>
                      <Send size={12} />
                      Test
                    </>
                  )}
                </button>
                <button
                  onClick={() => { setEditing(true); setEditUrl(wh.url); setEditEvents([...wh.events]); }}
                  className="btn btn--sm btn--icon"
                  title="Edit"
                >
                  <Edit2 size={13} />
                </button>
                <button
                  onClick={handleToggleActive}
                  disabled={isPending}
                  className="btn btn--sm btn--icon"
                  title={wh.is_active ? 'Disable' : 'Enable'}
                >
                  {wh.is_active ? <Pause size={13} /> : <Play size={13} />}
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="btn btn--sm btn--icon btn--danger"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
            {editing && (
              <>
                <button
                  onClick={handleSave}
                  disabled={isPending}
                  className="btn btn--sm btn--primary"
                >
                  {isPending ? '…' : 'Save'}
                </button>
                <button
                  onClick={() => { setEditing(false); setError(null); }}
                  className="btn btn--sm btn--ghost"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Delete confirmation */}
        {confirmDelete && (
          <div style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 6,
            background: 'var(--rose-bg)',
            border: '1px solid var(--rose-line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span className="text-xs" style={{ color: 'var(--rose)', fontWeight: 500 }}>Delete this webhook?</span>
            <div className="row gap-2">
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="btn btn--sm btn--danger"
              >
                {isPending ? '…' : 'Delete'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="btn btn--sm btn--ghost"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Test result */}
        {testResult && (
          <div className="text-xs" style={{
            marginBottom: 16,
            borderRadius: 6,
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            
            fontWeight: 500,
            background: testResult.success ? 'var(--mint-bg)' : 'var(--rose-bg)',
            border: testResult.success
              ? '1px solid var(--mint-line)'
              : '1px solid var(--rose-line)',
            color: testResult.success ? 'var(--mint)' : 'var(--rose)',
          }}>
            {testResult.success ? <Check size={13} /> : <X size={13} />}
            <span>
              {testResult.success
                ? `OK — ${testResult.status} ${testResult.statusText}`
                : testResult.error
                  ? `Failed — ${testResult.error}`
                  : `Failed — ${testResult.status} ${testResult.statusText}`}
            </span>
            {testResult.responseTime !== undefined && (
              <span className="mono num text-2xs" style={{ color: 'var(--fg-4)', marginLeft: 'auto' }}>{testResult.responseTime}ms</span>
            )}
          </div>
        )}

        {/* Event badges (editable when editing) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {editing ? (
            ALL_EVENTS.map((ev) => (
              <button
                key={ev}
                type="button"
                onClick={() => toggleEvent(ev)}
                className="pill mono"
                style={editEvents.includes(ev)
                  ? { color: 'var(--peri)', background: 'var(--peri-bg)', borderColor: 'var(--peri-line)', cursor: 'pointer' }
                  : { color: 'var(--fg-4)', background: 'transparent', borderColor: 'var(--line-1)', cursor: 'pointer' }
                }
              >
                {editEvents.includes(ev) && <Check size={10} />}{ev}
              </button>
            ))
          ) : (
            wh.events.map((event) => (
              <span key={event} className="pill pill--peri mono">
                {event}
              </span>
            ))
          )}
        </div>

        {/* Stats row */}
        <div className="row gap-6" style={{ paddingTop: 12, borderTop: '1px solid var(--line-1)' }}>
          <div>
            <p className="upper" style={{ marginBottom: 4 }}>Last Delivery</p>
            <span className="mono num text-xs" style={{ color: 'var(--fg-2)' }}>
              {wh.last_delivery_at ? timeAgo(wh.last_delivery_at) : 'Never'}
            </span>
          </div>
          <div>
            <p className="upper" style={{ marginBottom: 4 }}>Created</p>
            <span className="mono num text-xs" style={{ color: 'var(--fg-2)' }}>
              {formatDate(wh.created_at)}
            </span>
          </div>
          <div>
            <p className="upper" style={{ marginBottom: 4 }}>Updated</p>
            <span className="mono num text-xs" style={{ color: 'var(--fg-2)' }}>
              {formatDate(wh.updated_at)}
            </span>
          </div>
          {wh.failure_count > 0 && (
            <div>
              <p className="upper" style={{ marginBottom: 4 }}>Consecutive Fails</p>
              <span className="mono num text-xs" style={{ color: 'var(--amber)', fontWeight: 600 }}>
                {wh.failure_count}
                <span className="text-2xs" style={{ color: 'var(--fg-4)', fontWeight: 400, marginLeft: 4 }}>/ 10 to auto-disable</span>
              </span>
            </div>
          )}
        </div>

        {/* Recent Deliveries */}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line-1)' }}>
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
            className="btn btn--ghost btn--sm"
            style={{ gap: 6, paddingLeft: 0 }}
          >
            <ChevronRight
              size={12}
              style={{
                transition: 'transform 0.2s',
                transform: showDeliveries ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            />
            <span className="upper text-2xs">
              {deliveriesLoading ? 'Loading…' : `Recent Deliveries${deliveries.length > 0 ? ` (${deliveries.length})` : ''}`}
            </span>
          </button>

          {showDeliveries && deliveries.length > 0 && (() => {
            const successCount = deliveries.filter(d => d.status === 'success').length;
            const failedCount = deliveries.filter(d => d.status === 'failed').length;
            return (
              <div className="animate-fade-in" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* Summary bar */}
                <div className="row gap-4" style={{
                  padding: '8px 12px',
                  marginBottom: 4,
                  borderRadius: 6,
                  background: 'var(--bg-2)',
                  border: '1px solid var(--line-1)',
                }}>
                  <span className="text-2xs" style={{ color: 'var(--fg-3)' }}>Last {deliveries.length} deliveries:</span>
                  <span className="text-2xs" style={{ fontWeight: 600, color: deliveryColor('success') }}>{successCount} OK</span>
                  {failedCount > 0 && <span className="text-2xs" style={{ fontWeight: 600, color: deliveryColor('failed') }}>{failedCount} failed</span>}
                  {deliveries.filter(d => d.status === 'retrying' || d.status === 'pending_retry').length > 0 && (
                    <span className="text-2xs" style={{ fontWeight: 600, color: deliveryColor('retrying') }}>{deliveries.filter(d => d.status === 'retrying' || d.status === 'pending_retry').length} retrying</span>
                  )}
                  {deliveries.filter(d => d.status === 'pending').length > 0 && (
                    <span className="text-2xs" style={{ fontWeight: 600, color: deliveryColor('pending') }}>{deliveries.filter(d => d.status === 'pending').length} pending</span>
                  )}
                  <span className="mono num text-2xs" style={{ color: 'var(--fg-4)', marginLeft: 'auto' }}>
                    {Math.round((successCount / deliveries.length) * 100)}% success rate
                  </span>
                </div>

                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 80px 100px', gap: 8, padding: '4px 12px' }}>
                  <span className="upper text-2xs">Event</span>
                  <span className="upper text-2xs">Status</span>
                  <span className="upper text-2xs">HTTP</span>
                  <span className="upper text-2xs">Attempts</span>
                  <span className="upper text-2xs" style={{ textAlign: 'right' }}>When</span>
                </div>
                {deliveries.map((d) => {
                  const maxRetries = d.max_retries ?? 1;
                  const isFailed = d.status === 'failed';
                  const isSuccess = d.status === 'success';
                  const rowTone = statusTone('webhook-delivery', d.status);
                  // A successful row is the quiet one: the tint is there to find
                  // the deliveries that are not fine.
                  const rowBg = isSuccess ? 'var(--bg-2)' : surfaceVarForTone(rowTone);
                  const rowBorder = isSuccess ? 'var(--line-1)' : lineVarForTone(rowTone);
                  return (
                    <div
                      key={d.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 80px 90px 80px 100px',
                        gap: 8,
                        padding: '8px 12px',
                        borderRadius: 6,
                        background: rowBg,
                        border: `1px solid ${rowBorder}`,
                      }}
                    >
                      <span className="mono text-xs" style={{ color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.event}</span>
                      <span className="text-xs" style={{ fontWeight: 600, color: colorVarForTone(rowTone) }}>
                        {isSuccess
                          ? d.attempts > 1 ? `Attempt ${d.attempts}` : 'OK'
                          : isFailed
                            ? d.attempts > 1 ? `${d.attempts} tries` : 'Failed'
                            : d.status === 'retrying' || d.status === 'pending_retry'
                              ? `Retry ${d.attempts}/${maxRetries}`
                              : 'Pending'}
                      </span>
                      <span className="mono num text-xs" style={{ color: colorVarForTone(httpStatusTone(d.response_status)) }}>
                        {d.response_status ? d.response_status : d.status === 'failed' ? 'Network' : '—'}
                      </span>
                      <span className="mono num text-xs" style={{ color: 'var(--fg-3)' }}>
                        {d.attempts}/{maxRetries}
                      </span>
                      <span className="mono num text-2xs" style={{ color: 'var(--fg-4)', textAlign: 'right' }}>
                        {d.delivered_at ? timeAgo(d.delivered_at) : d.created_at ? timeAgo(d.created_at) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {showDeliveries && !deliveriesLoading && deliveries.length === 0 && (
            <EmptyState title="No deliveries recorded yet" />
          )}
        </div>
      </div>
    </div>
  );
}
