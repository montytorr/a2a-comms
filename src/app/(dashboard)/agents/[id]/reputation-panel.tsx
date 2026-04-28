import Link from 'next/link';
import { formatDateTime } from '@/lib/format-date';
import { REPUTATION_SIGNAL_WEIGHTS } from '@/lib/reputation-score';
import type { AgentReputationDetail, ReputationLedgerEvent, ReputationSignalValue } from '@/lib/types';

interface ReputationPanelProps {
  reputation: AgentReputationDetail;
}

function toPercent(value: number | null | undefined, digits = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

function signalMeta(key: ReputationSignalValue['key']) {
  return REPUTATION_SIGNAL_WEIGHTS.find((signal) => signal.key === key);
}

function scoreToneVar(score: number | null): string {
  if (typeof score !== 'number') return 'var(--fg-2)';
  if (score >= 0.8) return 'var(--mint)';
  if (score >= 0.6) return 'var(--peri)';
  if (score >= 0.4) return 'var(--amber)';
  return 'var(--rose)';
}

function deltaToneVar(delta: number): string {
  if (delta > 0) return 'var(--mint)';
  if (delta < 0) return 'var(--rose)';
  return 'var(--fg-3)';
}

function summarizeMetadata(event: ReputationLedgerEvent) {
  const metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
  const parts: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      parts.push(`${key.replace(/_/g, ' ')}: ${String(value)}`);
    }
    if (parts.length >= 3) break;
  }
  return parts;
}

function buildEvidenceLinks(event: ReputationLedgerEvent) {
  const links: Array<{ href: string; label: string }> = [];
  if (event.project_id && event.task_id) {
    links.push({ href: `/projects/${event.project_id}/tasks/${event.task_id}`, label: 'Task context' });
  }
  if (event.project_id && !event.task_id) {
    links.push({ href: `/projects/${event.project_id}`, label: 'Project' });
  }
  if (event.contract_id) {
    links.push({ href: `/contracts/${event.contract_id}`, label: 'Contract' });
  }
  return links;
}

export default function ReputationPanel({ reputation }: ReputationPanelProps) {
  const policyGuidance = reputation.policy_guidance;
  const score = reputation.score;
  const confidence = reputation.confidence ?? 0;
  const visible = reputation.explanation.gating.is_visible;
  const stable = reputation.explanation.gating.is_stable;
  const signals = [...reputation.signals].sort((a, b) => (b.weighted_contribution ?? 0) - (a.weighted_contribution ?? 0));
  const signalMap = new Map(reputation.signals.map((signal) => [signal.key, signal]));
  const recentEvents = reputation.ledger_events.slice(0, 5);
  const newestEventAt = reputation.explanation.decay.newest_event_at;
  const previousWindow = reputation.ledger_events.slice(3, 8);
  const previousAverage = previousWindow.length > 0
    ? previousWindow.reduce((sum, event) => sum + (event.value + 1) / 2, 0) / previousWindow.length
    : null;
  const recentAverage = recentEvents.length > 0
    ? recentEvents.reduce((sum, event) => sum + (event.value + 1) / 2, 0) / recentEvents.length
    : null;
  const recentDelta = recentAverage !== null && previousAverage !== null ? recentAverage - previousAverage : null;

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '1.25rem 1.75rem', borderBottom: '1px solid var(--line-1)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <h2 className="h3">Reputation</h2>
            <p className="dim" style={{ fontSize: '11px', marginTop: '0.125rem' }}>Advisory only, read-only scoring from recent platform signals.</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
            <span className="pill pill--ghost">{reputation.confidence_band} confidence</span>
            <span className="pill pill--ghost">{stable ? 'stable' : 'provisional'}</span>
            {reputation.explanation.adjustments.manual_review_only && (
              <span className="pill pill--rose">manual review hold</span>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="card--inset" style={{ padding: '1rem', gridColumn: 'span 2' }}>
            <p className="upper dim" style={{ fontSize: '9px' }}>Overall score</p>
            <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'flex-end', gap: '0.75rem' }}>
              <span className="num" style={{ fontSize: '1.875rem', fontWeight: 600, color: scoreToneVar(score) }}>{toPercent(score)}</span>
              {recentDelta !== null && (
                <span style={{ marginBottom: '0.25rem', fontSize: '11px', fontWeight: 500, color: deltaToneVar(recentDelta) }}>
                  {recentDelta > 0 ? '+' : ''}{(recentDelta * 100).toFixed(1)} pts vs prior recent window
                </span>
              )}
            </div>
            <p className="muted" style={{ marginTop: '0.5rem', fontSize: '12px' }}>
              {visible
                ? 'Weighted blend of delivery, approvals, collaboration, and security.'
                : reputation.explanation.gating.reason || 'Not enough evidence yet to show a score.'}
            </p>
          </div>

          <div className="card--inset" style={{ padding: '1rem' }}>
            <p className="upper dim" style={{ fontSize: '9px' }}>Confidence</p>
            <p className="num" style={{ marginTop: '0.5rem', fontSize: '1.5rem', fontWeight: 600, color: 'var(--fg-0)' }}>{toPercent(confidence)}</p>
            <p className="dim" style={{ marginTop: '0.5rem', fontSize: '11px' }}>Band: {reputation.confidence_band}</p>
          </div>

          <div className="card--inset" style={{ padding: '1rem' }}>
            <p className="upper dim" style={{ fontSize: '9px' }}>Sample size</p>
            <p className="num" style={{ marginTop: '0.5rem', fontSize: '1.5rem', fontWeight: 600, color: 'var(--fg-0)' }}>{reputation.explanation.gating.observed_events}</p>
            <p className="dim" style={{ marginTop: '0.5rem', fontSize: '11px' }}>Latest signal {newestEventAt ? formatDateTime(newestEventAt) : '—'}</p>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1.2fr 0.8fr' }}>
          <div className="card--inset" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <p className="upper muted" style={{ fontSize: '11px' }}>Component breakdown</p>
                <p className="dim" style={{ fontSize: '11px', marginTop: '0.25rem' }}>Read-only breakdown of the current scoring inputs.</p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {signals.map((signal) => {
                const meta = signalMeta(signal.key);
                const width = `${Math.max(4, Math.round(signal.value * 100))}%`;
                return (
                  <div key={signal.key} className="card--inset" style={{ padding: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <div>
                        <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--fg-0)' }}>{meta?.label ?? signal.key}</p>
                        {meta?.description && <p className="dim" style={{ fontSize: '11px', marginTop: '0.25rem' }}>{meta.description}</p>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p className="num" style={{ fontSize: '12px', fontWeight: 600, color: scoreToneVar(signal.value) }}>{toPercent(signal.value)}</p>
                        <p className="dim" style={{ fontSize: '10px' }}>weight {(meta?.weight ?? 0) * 100}%</p>
                      </div>
                    </div>
                    <div style={{ marginTop: '0.75rem', height: '0.5rem', borderRadius: '9999px', background: 'var(--bg-2)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: '9999px', background: 'var(--mint)', width }} />
                    </div>
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.25rem 1rem', fontSize: '10px', color: 'var(--fg-3)' }}>
                      <span>samples {signal.sample_count}</span>
                      <span>contribution {toPercent(signal.weighted_contribution ?? 0, 1)}</span>
                      <span>latest {signal.last_event_at ? formatDateTime(signal.last_event_at) : '—'}</span>
                    </div>
                    {signal.notes && signal.notes.length > 0 && (
                      <ul style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '11px', color: 'var(--fg-2)' }}>
                        {signal.notes.slice(0, 2).map((note) => (
                          <li key={note}>• {note}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="card--inset" style={{ padding: '1rem' }}>
              <p className="upper muted" style={{ fontSize: '11px' }}>Policy guidance</p>
              <p className="muted" style={{ marginTop: '0.5rem', fontSize: '12px' }}>Reputation can suggest extra review or caution, but it does not grant or revoke access.</p>
              {policyGuidance && (
                <>
                  <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span className="pill pill--ghost">{policyGuidance.recommended_posture}</span>
                    <span className="pill pill--ghost">advisory only</span>
                  </div>
                  <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {policyGuidance.items.map((item) => (
                      <div key={item.id} className="card--inset" style={{ padding: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                          <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--fg-0)' }}>{item.title}</p>
                          <span
                            className="upper"
                            style={{
                              fontSize: '10px',
                              color: item.severity === 'elevated' ? 'var(--rose)' : item.severity === 'warning' ? 'var(--amber)' : 'var(--fg-3)',
                            }}
                          >{item.severity}</span>
                        </div>
                        <p className="muted" style={{ marginTop: '0.5rem', fontSize: '11px' }}>{item.summary}</p>
                        <p style={{ marginTop: '0.5rem', fontSize: '11px', color: 'var(--peri)' }}>Recommended: {item.recommendation}</p>
                        {item.rationale && <p className="dim" style={{ marginTop: '0.5rem', fontSize: '11px' }}>Why: {item.rationale}</p>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="card--inset" style={{ padding: '1rem' }}>
              <p className="upper muted" style={{ fontSize: '11px' }}>Recent changes</p>
              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '12px', color: 'var(--fg-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <span>Visible score</span>
                  <span>{visible ? 'Yes' : 'No'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <span>Stability</span>
                  <span>{stable ? 'Stable' : 'Building evidence'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <span>Recent delta</span>
                  <span style={{ color: deltaToneVar(recentDelta ?? 0) }}>{recentDelta !== null ? `${recentDelta > 0 ? '+' : ''}${(recentDelta * 100).toFixed(1)} pts` : '—'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <span>Anti-gaming penalty</span>
                  <span>{toPercent(reputation.explanation.adjustments.anti_gaming_penalty, 1)}</span>
                </div>
              </div>
              {reputation.explanation.adjustments.reasons.length > 0 && (
                <ul style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '11px', color: 'var(--amber)' }}>
                  {reputation.explanation.adjustments.reasons.map((reason) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card--inset" style={{ padding: '1rem' }}>
              <p className="upper muted" style={{ fontSize: '11px' }}>Evidence and context</p>
              {recentEvents.length === 0 ? (
                <p className="dim" style={{ marginTop: '0.75rem', fontSize: '12px' }}>No reputation ledger events recorded yet.</p>
              ) : (
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {recentEvents.map((event) => {
                    const meta = signalMap.get(event.signal_key);
                    const evidenceLinks = buildEvidenceLinks(event);
                    const metadataSummary = summarizeMetadata(event);
                    return (
                      <div key={event.id} className="card--inset" style={{ padding: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
                          <div>
                            <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--fg-0)' }}>{signalMeta(event.signal_key)?.label ?? event.signal_key}</p>
                            <p className="upper dim" style={{ fontSize: '10px', marginTop: '0.25rem' }}>{event.source_type.replace(/_/g, ' ')}</p>
                          </div>
                          <span className="num" style={{ fontSize: '11px', fontWeight: 600, color: scoreToneVar((event.value + 1) / 2) }}>
                            {event.value > 0 ? '+' : ''}{event.value.toFixed(2)}
                          </span>
                        </div>
                        <p className="dim" style={{ marginTop: '0.5rem', fontSize: '11px' }}>Occurred {formatDateTime(event.occurred_at)}</p>
                        {meta?.notes && meta.notes.length > 0 && (
                          <p className="muted" style={{ marginTop: '0.5rem', fontSize: '11px' }}>{meta.notes[0]}</p>
                        )}
                        {metadataSummary.length > 0 && (
                          <ul className="dim" style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '11px' }}>
                            {metadataSummary.map((item) => (
                              <li key={item}>• {item}</li>
                            ))}
                          </ul>
                        )}
                        {evidenceLinks.length > 0 && (
                          <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {evidenceLinks.map((link) => (
                              <Link key={`${event.id}-${link.href}`} href={link.href} style={{ fontSize: '11px', color: 'var(--peri)', textDecoration: 'none' }}>
                                {link.label} →
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
