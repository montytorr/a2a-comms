import { createServerClient } from '@/lib/supabase/server';
import {
  REPUTATION_DEFAULT_HALF_LIFE_DAYS,
  REPUTATION_FULL_CONFIDENCE_EVENT_COUNT,
  REPUTATION_MIN_EVENTS_FOR_PROVISIONAL,
  REPUTATION_MIN_EVENTS_FOR_STABLE,
  REPUTATION_SCORE_VERSION,
  REPUTATION_SIGNAL_KEYS,
  REPUTATION_SIGNAL_WEIGHTS,
  REPUTATION_STALE_AFTER_DAYS,
  getReputationConfidenceBand,
  type ReputationScoreExplanation as ReputationScoreExplanationContract,
  type ReputationSignalKey,
} from '@/lib/reputation-score';
import type {
  AgentReputationSnapshot,
  OperatorFeedbackInput,
  ReputationConfidenceBand,
  ReputationScoreExplanation,
  ReputationSignalValue,
} from '@/lib/types';
import { buildReputationPolicyGuidance } from '@/lib/reputation-policy-guidance';
import type { PostgrestError } from '@supabase/supabase-js';

export const REPUTATION_EVENT_SOURCE_TYPES = [
  'task_run',
  'approval',
  'operator_review',
  'security_incident',
  'handoff',
  'system',
] as const;

export type ReputationEventSourceType = typeof REPUTATION_EVENT_SOURCE_TYPES[number];

export interface ReputationLedgerEvent {
  id: string;
  agent_id: string;
  occurred_at: string;
  recorded_at: string;
  source_type: ReputationEventSourceType;
  signal_key: ReputationSignalKey;
  value: number;
  weight_hint: number | null;
  source_id: string | null;
  project_id: string | null;
  task_id: string | null;
  contract_id: string | null;
  reviewer_agent_id: string | null;
  reviewer_user_id: string | null;
  metadata: Record<string, unknown>;
}

export interface CreateReputationLedgerEventInput {
  agentId: string;
  occurredAt?: string;
  recordedAt?: string;
  sourceType: ReputationEventSourceType;
  signalKey: ReputationSignalKey;
  value: number;
  weightHint?: number | null;
  sourceId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  contractId?: string | null;
  reviewerAgentId?: string | null;
  reviewerUserId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ReputationAggregationOptions {
  evaluatedAt?: string;
  includeEvents?: ReputationLedgerEvent[];
}

export interface ReputationSignalAggregate {
  key: ReputationSignalKey;
  value: number;
  sampleCount: number;
  weightedContribution: number;
  lastEventAt: string | null;
  notes: string[];
}

export interface ReputationAggregationResult {
  snapshot: AgentReputationSnapshot;
  events: ReputationLedgerEvent[];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeEventValue(value: number) {
  return clamp((value + 1) / 2, 0, 1);
}

function daysBetween(olderIso: string, newerIso: string) {
  const older = new Date(olderIso).getTime();
  const newer = new Date(newerIso).getTime();
  if (!Number.isFinite(older) || !Number.isFinite(newer)) return 0;
  return Math.max(0, (newer - older) / (1000 * 60 * 60 * 24));
}

function getDecayMultiplier(occurredAt: string, evaluatedAt: string) {
  const ageDays = daysBetween(occurredAt, evaluatedAt);
  return 0.5 ** (ageDays / REPUTATION_DEFAULT_HALF_LIFE_DAYS);
}

function buildSignalNotes(key: ReputationSignalKey, value: number, sampleCount: number) {
  const notes: string[] = [];
  if (sampleCount === 0) {
    notes.push('No ledger events recorded yet');
    return notes;
  }

  if (value >= 0.8) notes.push('Recent signals are strongly positive');
  else if (value >= 0.6) notes.push('Recent signals are net positive');
  else if (value <= 0.3) notes.push('Recent signals are concerning');
  else if (value <= 0.45) notes.push('Recent signals show mixed reliability');
  else notes.push('Recent signals are mixed');

  if (key === 'security_hygiene' && value <= 0.4) {
    notes.push('Security or policy-related incidents are suppressing this signal');
  }
  if (key === 'operator_feedback' && sampleCount > 0) {
    notes.push('Includes explicit operator review input');
  }

  return notes;
}

function toExplanationContract(explanation: ReputationScoreExplanation): ReputationScoreExplanationContract {
  return {
    scoreVersion: explanation.score_version,
    score: explanation.score,
    confidence: explanation.confidence,
    confidenceBand: explanation.confidence_band,
    gating: {
      minimumEventsForProvisional: explanation.gating.minimum_events_for_provisional,
      minimumEventsForStable: explanation.gating.minimum_events_for_stable,
      observedEvents: explanation.gating.observed_events,
      isVisible: explanation.gating.is_visible,
      isStable: explanation.gating.is_stable,
      reason: explanation.gating.reason,
    },
    decay: {
      halfLifeDays: explanation.decay.half_life_days,
      staleAfterDays: explanation.decay.stale_after_days,
      evaluatedAt: explanation.decay.evaluated_at,
      newestEventAt: explanation.decay.newest_event_at,
    },
    signals: explanation.signals.map((signal) => ({
      key: signal.key,
      label: REPUTATION_SIGNAL_WEIGHTS.find((entry) => entry.key === signal.key)?.label ?? signal.key,
      value: signal.value,
      weight: REPUTATION_SIGNAL_WEIGHTS.find((entry) => entry.key === signal.key)?.weight ?? 0,
      weightedContribution: signal.weighted_contribution ?? 0,
      sampleCount: signal.sample_count,
      lastEventAt: signal.last_event_at ?? null,
      notes: signal.notes,
    })),
    adjustments: {
      antiGamingPenalty: explanation.adjustments.anti_gaming_penalty,
      manualReviewOnly: explanation.adjustments.manual_review_only,
      reasons: explanation.adjustments.reasons,
    },
  };
}

export function detectBurstPenalty(events: ReputationLedgerEvent[], evaluatedAt: string) {
  const reasons: string[] = [];
  let penalty = 0;
  let manualReviewOnly = false;

  const recentEvents = events.filter((event) => daysBetween(event.occurred_at, evaluatedAt) <= 1);
  const sourceBuckets = new Map<string, number>();
  for (const event of recentEvents) {
    const burstKey = `${event.source_type}:${event.source_id ?? event.task_id ?? event.contract_id ?? 'none'}:${event.signal_key}`;
    sourceBuckets.set(burstKey, (sourceBuckets.get(burstKey) ?? 0) + 1);
  }

  const duplicateBursts = Array.from(sourceBuckets.values()).filter((count) => count > 3).length;
  if (duplicateBursts > 0) {
    penalty += Math.min(0.12, duplicateBursts * 0.03);
    reasons.push('Burst activity pattern detected');
  }

  const positiveOnlyBurst = recentEvents.length >= 8 && recentEvents.every((event) => event.value >= 0.5);
  if (positiveOnlyBurst) {
    penalty += 0.02;
    reasons.push('Short-window evidence is unusually concentrated');
  }

  const uniqueProjects = new Set(events.map((event) => event.project_id).filter(Boolean));
  const uniqueReviewers = new Set(events.map((event) => event.reviewer_agent_id ?? event.reviewer_user_id).filter(Boolean));
  if (events.length >= REPUTATION_MIN_EVENTS_FOR_STABLE && uniqueProjects.size + uniqueReviewers.size <= 1) {
    penalty += 0.03;
    reasons.push('Low source diversity');
  }

  const seriousSecurityEvents = events.filter(
    (event) => event.signal_key === 'security_hygiene' && event.value <= -0.8
  ).length;
  if (seriousSecurityEvents >= 2) {
    penalty += Math.min(0.2, seriousSecurityEvents * 0.05);
    reasons.push('Repeated severe security incidents');
  }
  if (seriousSecurityEvents >= 4) {
    manualReviewOnly = true;
    reasons.push('Manual review hold triggered by severe incident volume');
  }

  return {
    antiGamingPenalty: Number(clamp(penalty, 0, 0.35).toFixed(4)),
    manualReviewOnly,
    reasons,
  };
}

function computeConfidence(events: ReputationLedgerEvent[], evaluatedAt: string, signals: ReputationSignalValue[]): number {
  if (events.length < REPUTATION_MIN_EVENTS_FOR_PROVISIONAL) return 0;

  const countFactor = clamp(events.length / REPUTATION_FULL_CONFIDENCE_EVENT_COUNT, 0, 1);
  const activeSignals = signals.filter((signal) => signal.sample_count > 0).length;
  const diversityFactor = clamp(activeSignals / REPUTATION_SIGNAL_KEYS.length, 0, 1);

  const sourceDiversity = new Set(
    events.map((event) => event.project_id ?? event.contract_id ?? event.reviewer_agent_id ?? event.reviewer_user_id ?? event.source_type)
  ).size;
  const sourceFactor = clamp(sourceDiversity / 6, 0, 1);

  let stalePenalty = 0;
  const newestEventAt = events[0]?.occurred_at ?? null;
  if (newestEventAt && daysBetween(newestEventAt, evaluatedAt) > REPUTATION_STALE_AFTER_DAYS) {
    stalePenalty = 0.3;
  }

  const rawConfidence = countFactor * 0.55 + diversityFactor * 0.25 + sourceFactor * 0.2 - stalePenalty;
  return Number(clamp(rawConfidence, 0, 1).toFixed(4));
}

function buildSignalAggregates(events: ReputationLedgerEvent[], evaluatedAt: string): ReputationSignalAggregate[] {
  return REPUTATION_SIGNAL_WEIGHTS.map((signal) => {
    const signalEvents = events.filter((event) => event.signal_key === signal.key);

    let weightedTotal = 0;
    let totalWeight = 0;
    for (const event of signalEvents) {
      const decay = getDecayMultiplier(event.occurred_at, evaluatedAt);
      const hint = event.weight_hint ?? 1;
      const stickyMultiplier =
        signal.key === 'security_hygiene' && event.value < 0
          ? Math.max(1.5, 1 + Math.abs(event.value))
          : 1;
      const eventWeight = Math.max(0.05, hint) * decay * stickyMultiplier;
      totalWeight += eventWeight;
      weightedTotal += normalizeEventValue(event.value) * eventWeight;
    }

    const value = totalWeight > 0 ? weightedTotal / totalWeight : 0;
    return {
      key: signal.key,
      value: Number(clamp(value, 0, 1).toFixed(4)),
      sampleCount: signalEvents.length,
      weightedContribution: Number((clamp(value, 0, 1) * signal.weight).toFixed(4)),
      lastEventAt: signalEvents[0]?.occurred_at ?? null,
      notes: buildSignalNotes(signal.key, value, signalEvents.length),
    };
  });
}

function toSnapshot(params: {
  agentId: string;
  events: ReputationLedgerEvent[];
  signals: ReputationSignalAggregate[];
  observedEvents: number;
  evaluatedAt: string;
  newestEventAt: string | null;
  adjustments: { antiGamingPenalty: number; manualReviewOnly: boolean; reasons: string[] };
}): AgentReputationSnapshot {
  const rawScore = params.signals.reduce((sum, signal) => sum + signal.weightedContribution, 0);
  const visible = params.observedEvents >= REPUTATION_MIN_EVENTS_FOR_PROVISIONAL;
  const stable = params.observedEvents >= REPUTATION_MIN_EVENTS_FOR_STABLE;
  const score = visible ? Number(clamp(rawScore - params.adjustments.antiGamingPenalty, 0, 1).toFixed(4)) : null;
  const signalValues: ReputationSignalValue[] = params.signals.map((signal) => ({
    key: signal.key,
    value: signal.value,
    sample_count: signal.sampleCount,
    weighted_contribution: signal.weightedContribution,
    last_event_at: signal.lastEventAt,
    notes: signal.notes,
  }));

  const resolvedConfidence = visible ? computeConfidence(params.events, params.evaluatedAt, signalValues) : 0;
  const confidenceBand: ReputationConfidenceBand = getReputationConfidenceBand(resolvedConfidence);

  const explanation: ReputationScoreExplanation = {
    score_version: REPUTATION_SCORE_VERSION,
    score,
    confidence: resolvedConfidence,
    confidence_band: confidenceBand,
    gating: {
      minimum_events_for_provisional: REPUTATION_MIN_EVENTS_FOR_PROVISIONAL,
      minimum_events_for_stable: REPUTATION_MIN_EVENTS_FOR_STABLE,
      observed_events: params.observedEvents,
      is_visible: visible,
      is_stable: stable,
      reason: visible ? undefined : 'Not enough reputation events to show a score yet',
    },
    decay: {
      half_life_days: REPUTATION_DEFAULT_HALF_LIFE_DAYS,
      stale_after_days: REPUTATION_STALE_AFTER_DAYS,
      evaluated_at: params.evaluatedAt,
      newest_event_at: params.newestEventAt,
    },
    signals: signalValues,
    adjustments: {
      anti_gaming_penalty: params.adjustments.antiGamingPenalty,
      manual_review_only: params.adjustments.manualReviewOnly,
      reasons: params.adjustments.reasons,
    },
  };

  return {
    agent_id: params.agentId,
    score_version: REPUTATION_SCORE_VERSION,
    score,
    confidence: resolvedConfidence,
    confidence_band: confidenceBand,
    stable,
    signals: signalValues,
    explanation,
    calculated_at: params.evaluatedAt,
  };
}

function isMissingReputationTable(error: PostgrestError | null) {
  return !!error && /(reputation_ledger_events|relation .* does not exist|column .*reputation_snapshot.* does not exist)/i.test(error.message || '');
}

export async function listReputationLedgerEvents(agentId: string, limit = 100) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('reputation_ledger_events')
    .select('*')
    .eq('agent_id', agentId)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingReputationTable(error)) return [] as ReputationLedgerEvent[];
    throw error;
  }

  return (data || []) as ReputationLedgerEvent[];
}

export async function appendReputationLedgerEvent(input: CreateReputationLedgerEventInput) {
  const supabase = createServerClient();
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const recordedAt = input.recordedAt ?? new Date().toISOString();

  const { data, error } = await supabase
    .from('reputation_ledger_events')
    .insert({
      agent_id: input.agentId,
      occurred_at: occurredAt,
      recorded_at: recordedAt,
      source_type: input.sourceType,
      signal_key: input.signalKey,
      value: Number(clamp(input.value, -1, 1).toFixed(4)),
      weight_hint: input.weightHint ?? null,
      source_id: input.sourceId ?? null,
      project_id: input.projectId ?? null,
      task_id: input.taskId ?? null,
      contract_id: input.contractId ?? null,
      reviewer_agent_id: input.reviewerAgentId ?? null,
      reviewer_user_id: input.reviewerUserId ?? null,
      metadata: input.metadata ?? {},
    })
    .select()
    .single();

  if (error) throw error;

  return data as ReputationLedgerEvent;
}

export function aggregateReputationLedger(params: {
  agentId: string;
  events: ReputationLedgerEvent[];
  evaluatedAt?: string;
}): ReputationAggregationResult {
  const evaluatedAt = params.evaluatedAt ?? new Date().toISOString();
  const events = [...params.events].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
  const signalAggregates = buildSignalAggregates(events, evaluatedAt);
  const adjustments = detectBurstPenalty(events, evaluatedAt);
  const snapshot = toSnapshot({
    agentId: params.agentId,
    events,
    signals: signalAggregates,
    observedEvents: events.length,
    evaluatedAt,
    newestEventAt: events[0]?.occurred_at ?? null,
    adjustments,
  });

  return { snapshot, events };
}

export async function recomputeAgentReputation(agentId: string, options: ReputationAggregationOptions = {}) {
  const events = options.includeEvents ?? (await listReputationLedgerEvents(agentId, 500));
  return aggregateReputationLedger({ agentId, events, evaluatedAt: options.evaluatedAt });
}

export async function persistAgentReputationSnapshot(snapshot: AgentReputationSnapshot) {
  const supabase = createServerClient();
  const { error } = await supabase
    .from('agents')
    .update({
      reputation_snapshot: snapshot,
      updated_at: new Date().toISOString(),
    })
    .eq('id', snapshot.agent_id);

  if (error) {
    if (isMissingReputationTable(error)) return;
    throw error;
  }
}

export async function recomputeAndPersistAgentReputation(agentId: string, options: ReputationAggregationOptions = {}) {
  const result = await recomputeAgentReputation(agentId, options);
  await persistAgentReputationSnapshot(result.snapshot);
  return result;
}

export async function getAgentReputationSnapshot(agentId: string, options: ReputationAggregationOptions = {}) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agents')
    .select('reputation_snapshot')
    .eq('id', agentId)
    .maybeSingle();

  if (error) {
    if (isMissingReputationTable(error)) {
      return (await recomputeAgentReputation(agentId, options)).snapshot;
    }
    throw error;
  }

  const snapshot = data?.reputation_snapshot as AgentReputationSnapshot | null | undefined;
  if (snapshot) return snapshot;

  return (await recomputeAgentReputation(agentId, options)).snapshot;
}

export async function recordOperatorFeedback(params: {
  agentId: string;
  reviewerAgentId?: string | null;
  reviewerUserId?: string | null;
  input: OperatorFeedbackInput;
}) {
  const normalizedScore = Number(clamp(params.input.score, -1, 1).toFixed(4));
  const event = await appendReputationLedgerEvent({
    agentId: params.agentId,
    sourceType: 'operator_review',
    signalKey: 'operator_feedback',
    value: normalizedScore,
    weightHint: params.input.weight_hint ?? null,
    projectId: params.input.related_project_id ?? null,
    taskId: params.input.related_task_id ?? null,
    contractId: params.input.related_contract_id ?? null,
    reviewerAgentId: params.reviewerAgentId ?? null,
    reviewerUserId: params.reviewerUserId ?? null,
    metadata: {
      summary: params.input.summary,
      notes: params.input.notes ?? null,
      review_label: params.input.review_label ?? null,
      source: 'operator-feedback',
      ...(params.input.metadata ?? {}),
    },
  });

  const recomputed = await recomputeAndPersistAgentReputation(params.agentId, {
    includeEvents: undefined,
  });

  return {
    event,
    snapshot: recomputed.snapshot,
  };
}

export async function getAgentReputationDetail(agentId: string, options: ReputationAggregationOptions = {}) {
  const result = await recomputeAgentReputation(agentId, options);
  const detail = {
    ...result.snapshot,
    ledger_events: result.events,
    explanation_contract: toExplanationContract(result.snapshot.explanation),
  };

  return {
    ...detail,
    policy_guidance: buildReputationPolicyGuidance(detail),
  };
}
