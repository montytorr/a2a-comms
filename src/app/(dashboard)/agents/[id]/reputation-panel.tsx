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

function scoreTone(score: number | null) {
  if (typeof score !== 'number') return 'text-gray-400';
  if (score >= 0.8) return 'text-emerald-400';
  if (score >= 0.6) return 'text-cyan-400';
  if (score >= 0.4) return 'text-amber-400';
  return 'text-rose-400';
}

function deltaTone(delta: number) {
  if (delta > 0) return 'text-emerald-400';
  if (delta < 0) return 'text-rose-400';
  return 'text-gray-500';
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
    <div className="rounded-2xl glass-card overflow-hidden animate-fade-in" style={{ animationDelay: '0.08s' }}>
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
      <div className="px-7 py-5 border-b border-white/[0.04]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-bold text-white tracking-tight">Reputation</h2>
            <p className="text-[11px] text-gray-600 mt-0.5">Advisory only, read-only scoring from recent platform signals.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.15em]">
            <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-gray-400">{reputation.confidence_band} confidence</span>
            <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-gray-400">{stable ? 'stable' : 'provisional'}</span>
            {reputation.explanation.adjustments.manual_review_only && (
              <span className="rounded-full border border-rose-500/20 bg-rose-500/[0.08] px-2.5 py-1 text-rose-300">manual review hold</span>
            )}
          </div>
        </div>
      </div>

      <div className="p-7 space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4 md:col-span-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-600">Overall score</p>
            <div className="mt-2 flex items-end gap-3">
              <span className={`text-3xl font-semibold tabular-nums ${scoreTone(score)}`}>{toPercent(score)}</span>
              {recentDelta !== null && (
                <span className={`mb-1 text-[11px] font-medium ${deltaTone(recentDelta)}`}>
                  {recentDelta > 0 ? '+' : ''}{(recentDelta * 100).toFixed(1)} pts vs prior recent window
                </span>
              )}
            </div>
            <p className="mt-2 text-[12px] text-gray-400">
              {visible
                ? 'Weighted blend of delivery, approvals, collaboration, and security.'
                : reputation.explanation.gating.reason || 'Not enough evidence yet to show a score.'}
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-600">Confidence</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{toPercent(confidence)}</p>
            <p className="mt-2 text-[11px] text-gray-500">Band: {reputation.confidence_band}</p>
          </div>

          <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-600">Sample size</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{reputation.explanation.gating.observed_events}</p>
            <p className="mt-2 text-[11px] text-gray-500">Latest signal {newestEventAt ? formatDateTime(newestEventAt) : '—'}</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Component breakdown</p>
                <p className="text-[11px] text-gray-600 mt-1">Read-only breakdown of the current scoring inputs.</p>
              </div>
            </div>
            <div className="space-y-3">
              {signals.map((signal) => {
                const meta = signalMeta(signal.key);
                const width = `${Math.max(4, Math.round(signal.value * 100))}%`;
                return (
                  <div key={signal.key} className="rounded-xl border border-white/[0.04] bg-black/10 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[12px] font-medium text-white">{meta?.label ?? signal.key}</p>
                        {meta?.description && <p className="text-[11px] text-gray-500 mt-1">{meta.description}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-[12px] font-semibold tabular-nums ${scoreTone(signal.value)}`}>{toPercent(signal.value)}</p>
                        <p className="text-[10px] text-gray-500">weight {(meta?.weight ?? 0) * 100}%</p>
                      </div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-white/[0.04] overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400" style={{ width }} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-gray-500">
                      <span>samples {signal.sample_count}</span>
                      <span>contribution {toPercent(signal.weighted_contribution ?? 0, 1)}</span>
                      <span>latest {signal.last_event_at ? formatDateTime(signal.last_event_at) : '—'}</span>
                    </div>
                    {signal.notes && signal.notes.length > 0 && (
                      <ul className="mt-2 space-y-1 text-[11px] text-gray-400">
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

          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Policy guidance</p>
              <p className="mt-2 text-[12px] text-gray-400">Reputation can suggest extra review or caution, but it does not grant or revoke access.</p>
              {policyGuidance && (
                <>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.15em]">
                    <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-gray-400">{policyGuidance.recommended_posture}</span>
                    <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-gray-400">advisory only</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {policyGuidance.items.map((item) => (
                      <div key={item.id} className="rounded-lg border border-white/[0.04] bg-black/10 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[12px] font-medium text-white">{item.title}</p>
                          <span className={`text-[10px] uppercase tracking-[0.15em] ${item.severity === 'elevated' ? 'text-rose-300' : item.severity === 'warning' ? 'text-amber-300' : 'text-gray-500'}`}>{item.severity}</span>
                        </div>
                        <p className="mt-2 text-[11px] text-gray-400">{item.summary}</p>
                        <p className="mt-2 text-[11px] text-cyan-300">Recommended: {item.recommendation}</p>
                        {item.rationale && <p className="mt-2 text-[11px] text-gray-500">Why: {item.rationale}</p>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Recent changes</p>
              <div className="mt-3 space-y-2 text-[12px] text-gray-400">
                <div className="flex items-center justify-between gap-3">
                  <span>Visible score</span>
                  <span>{visible ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Stability</span>
                  <span>{stable ? 'Stable' : 'Building evidence'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Recent delta</span>
                  <span className={deltaTone(recentDelta ?? 0)}>{recentDelta !== null ? `${recentDelta > 0 ? '+' : ''}${(recentDelta * 100).toFixed(1)} pts` : '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Anti-gaming penalty</span>
                  <span>{toPercent(reputation.explanation.adjustments.anti_gaming_penalty, 1)}</span>
                </div>
              </div>
              {reputation.explanation.adjustments.reasons.length > 0 && (
                <ul className="mt-3 space-y-1 text-[11px] text-amber-300">
                  {reputation.explanation.adjustments.reasons.map((reason) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Evidence and context</p>
              {recentEvents.length === 0 ? (
                <p className="mt-3 text-[12px] text-gray-500">No reputation ledger events recorded yet.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {recentEvents.map((event) => {
                    const meta = signalMap.get(event.signal_key);
                    const evidenceLinks = buildEvidenceLinks(event);
                    const metadataSummary = summarizeMetadata(event);
                    return (
                      <div key={event.id} className="rounded-lg border border-white/[0.04] bg-black/10 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[12px] font-medium text-white">{signalMeta(event.signal_key)?.label ?? event.signal_key}</p>
                            <p className="text-[10px] uppercase tracking-[0.15em] text-gray-600 mt-1">{event.source_type.replace(/_/g, ' ')}</p>
                          </div>
                          <span className={`text-[11px] font-semibold tabular-nums ${scoreTone((event.value + 1) / 2)}`}>
                            {event.value > 0 ? '+' : ''}{event.value.toFixed(2)}
                          </span>
                        </div>
                        <p className="mt-2 text-[11px] text-gray-500">Occurred {formatDateTime(event.occurred_at)}</p>
                        {meta?.notes && meta.notes.length > 0 && (
                          <p className="mt-2 text-[11px] text-gray-400">{meta.notes[0]}</p>
                        )}
                        {metadataSummary.length > 0 && (
                          <ul className="mt-2 space-y-1 text-[11px] text-gray-500">
                            {metadataSummary.map((item) => (
                              <li key={item}>• {item}</li>
                            ))}
                          </ul>
                        )}
                        {evidenceLinks.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {evidenceLinks.map((link) => (
                              <Link key={`${event.id}-${link.href}`} href={link.href} className="text-[11px] text-cyan-400 hover:text-cyan-300">
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
