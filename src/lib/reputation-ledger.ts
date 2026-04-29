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
  ReputationConfidenceBand,
  ReputationScoreExplanation,
  ReputationSignalValue,
} from '@/lib/types';
import { buildReputationPolicyGuidance } from '@/lib/reputation-policy-guidance';
import type { PostgrestError } from '@supabase/supabase-js';

type AuditLogRow = {
  id: string;
  actor: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

type TaskExecutionRunRow = {
  id: string;
  task_id: string;
  project_id: string;
  agent_id: string;
  status: string;
  attempt: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  heartbeat_at: string | null;
  summary: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
};

type TaskActivityEventRow = {
  id: string;
  project_id: string;
  task_id: string;
  actor_agent_id: string | null;
  actor_user_id: string | null;
  event_type: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export const REPUTATION_EVENT_SOURCE_TYPES = [
  'task_run',
  'approval',
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
    if (key === 'security_hygiene' && value > 0) {
      notes.push('Clean record — no security incidents');
    } else {
      const emptyNotes: Record<ReputationSignalKey, string> = {
        delivery_reliability: 'No task runs recorded yet for this agent',
        approval_outcomes: 'No formal approval-gate activity recorded — this agent has not triggered the approvals workflow',
        collaboration_quality: 'No contract, handoff, or messaging activity recorded yet',
        security_hygiene: 'No security activity recorded yet',
      };
      notes.push(emptyNotes[key]);
    }
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
  const totalEvents = events.length;
  const agentIsActive = totalEvents >= REPUTATION_MIN_EVENTS_FOR_PROVISIONAL;

  return REPUTATION_SIGNAL_WEIGHTS.map((signal) => {
    const signalEvents = events.filter((event) => event.signal_key === signal.key);

    if (signal.key === 'security_hygiene' && signalEvents.length === 0 && agentIsActive) {
      return {
        key: signal.key,
        value: 1,
        sampleCount: 0,
        weightedContribution: Number(signal.weight.toFixed(4)),
        lastEventAt: null,
        notes: buildSignalNotes(signal.key, 1, 0),
      };
    }

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

    const hasEvidence = totalWeight > 0;
    const value = hasEvidence ? weightedTotal / totalWeight : 0;
    return {
      key: signal.key,
      value: Number(clamp(value, 0, 1).toFixed(4)),
      sampleCount: signalEvents.length,
      weightedContribution: Number((hasEvidence ? clamp(value, 0, 1) * signal.weight : 0).toFixed(4)),
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
  const observedSignals = params.signals.filter((signal) => signal.sampleCount > 0 || (signal.key === 'security_hygiene' && signal.value > 0));
  const observedWeight = observedSignals.reduce((sum, signal) => {
    const configuredWeight = REPUTATION_SIGNAL_WEIGHTS.find((entry) => entry.key === signal.key)?.weight ?? 0;
    return sum + configuredWeight;
  }, 0);
  const weightedScoreSum = observedSignals.reduce((sum, signal) => sum + signal.weightedContribution, 0);
  const rawScore = observedWeight > 0 ? weightedScoreSum / observedWeight : 0;
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

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function dedupeReputationEvents(events: ReputationLedgerEvent[]) {
  const deduped = new Map<string, ReputationLedgerEvent>();
  for (const event of events) {
    deduped.set(event.id, event);
  }
  return Array.from(deduped.values()).sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
}

function buildDerivedEventId(parts: Array<string | null | undefined>) {
  return `derived:${parts.filter(Boolean).join(':')}`;
}

function getDerivedRunEvents(agentId: string, runs: TaskExecutionRunRow[]): ReputationLedgerEvent[] {
  return runs.flatMap((run) => {
    const occurredAt = run.completed_at ?? run.updated_at ?? run.created_at;
    const metadata = asObject(run.metadata);
    const baseMetadata = {
      derived: true,
      summary: run.summary,
      error_message: run.error_message,
      attempt: run.attempt,
      status: run.status,
      ...(Object.keys(metadata).length > 0 ? { run_metadata: metadata } : {}),
    };

    if (run.status === 'succeeded') {
      return [{
        id: buildDerivedEventId(['task-run', run.id, 'delivery_reliability']),
        agent_id: agentId,
        occurred_at: occurredAt,
        recorded_at: occurredAt,
        source_type: 'task_run',
        signal_key: 'delivery_reliability',
        value: 0.8,
        weight_hint: run.attempt > 1 ? 0.85 : 1,
        source_id: run.id,
        project_id: run.project_id,
        task_id: run.task_id,
        contract_id: asString(metadata.handoff_contract_id) ?? asString(metadata.escalation_contract_id),
        reviewer_agent_id: null,
        reviewer_user_id: null,
        metadata: baseMetadata,
      } satisfies ReputationLedgerEvent];
    }

    if (run.status === 'failed' || run.status === 'cancelled') {
      return [{
        id: buildDerivedEventId(['task-run', run.id, 'delivery_reliability']),
        agent_id: agentId,
        occurred_at: occurredAt,
        recorded_at: occurredAt,
        source_type: 'task_run',
        signal_key: 'delivery_reliability',
        value: run.status === 'failed' ? -0.7 : -0.45,
        weight_hint: 1,
        source_id: run.id,
        project_id: run.project_id,
        task_id: run.task_id,
        contract_id: asString(metadata.handoff_contract_id) ?? asString(metadata.escalation_contract_id),
        reviewer_agent_id: null,
        reviewer_user_id: null,
        metadata: baseMetadata,
      } satisfies ReputationLedgerEvent];
    }

    return [];
  });
}

function getDerivedTaskActivityEvents(agentId: string, events: TaskActivityEventRow[]): ReputationLedgerEvent[] {
  return events.flatMap((event) => {
    const metadata = asObject(event.metadata);

    if (event.event_type === 'handoff_claimed') {
      return [{
        id: buildDerivedEventId(['task-activity', event.id, 'collaboration_quality']),
        agent_id: agentId,
        occurred_at: event.created_at,
        recorded_at: event.created_at,
        source_type: 'handoff',
        signal_key: 'collaboration_quality',
        value: 0.75,
        weight_hint: 0.9,
        source_id: event.id,
        project_id: event.project_id,
        task_id: event.task_id,
        contract_id: asString(metadata.handoff_contract_id),
        reviewer_agent_id: null,
        reviewer_user_id: null,
        metadata: {
          derived: true,
          event_type: event.event_type,
          summary: event.summary,
        },
      } satisfies ReputationLedgerEvent];
    }

    if (event.event_type === 'blocker_escalation') {
      return [{
        id: buildDerivedEventId(['task-activity', event.id, 'collaboration_quality']),
        agent_id: agentId,
        occurred_at: event.created_at,
        recorded_at: event.created_at,
        source_type: 'handoff',
        signal_key: 'collaboration_quality',
        value: -0.35,
        weight_hint: 0.65,
        source_id: event.id,
        project_id: event.project_id,
        task_id: event.task_id,
        contract_id: asString(metadata.escalation_contract_id) ?? asString(metadata.contract_id),
        reviewer_agent_id: null,
        reviewer_user_id: null,
        metadata: {
          derived: true,
          event_type: event.event_type,
          summary: event.summary,
        },
      } satisfies ReputationLedgerEvent];
    }

    return [];
  });
}

function getDerivedAuditEvents(agentId: string, auditRows: AuditLogRow[], actorName: string | null): ReputationLedgerEvent[] {
  const normalizedActor = actorName?.trim().toLowerCase() ?? null;

  return auditRows.flatMap<ReputationLedgerEvent>((row) => {
    const details = asObject(row.details);
    const originalActor = asString(details.original_actor);
    const rowActor = row.actor?.trim().toLowerCase() ?? '';
    const matchesRequestedActor = normalizedActor && (rowActor === normalizedActor || originalActor?.trim().toLowerCase() === normalizedActor);

    if (row.action === 'approval.requested' && row.resource_type === 'approval' && rowActor === normalizedActor) {
      return [{
        id: buildDerivedEventId(['audit', row.id, 'approval-requested']),
        agent_id: agentId,
        occurred_at: row.created_at,
        recorded_at: row.created_at,
        source_type: 'approval',
        signal_key: 'approval_outcomes',
        value: 0.15,
        weight_hint: 0.3,
        source_id: row.resource_id,
        project_id: asString(details.project_id),
        task_id: asString(details.task_id),
        contract_id: asString(details.contract_id),
        reviewer_agent_id: null,
        reviewer_user_id: null,
        metadata: {
          derived: true,
          audit_action: row.action,
          approval_action: asString(details.approval_action),
        },
      } satisfies ReputationLedgerEvent];
    }

    if ((row.action === 'approval.approved' || row.action === 'approval.denied') && row.resource_type === 'approval' && matchesRequestedActor) {
      return [{
        id: buildDerivedEventId(['audit', row.id, row.action]),
        agent_id: agentId,
        occurred_at: row.created_at,
        recorded_at: row.created_at,
        source_type: 'approval',
        signal_key: 'approval_outcomes',
        value: row.action === 'approval.approved' ? 0.85 : -0.75,
        weight_hint: 1,
        source_id: row.resource_id,
        project_id: asString(details.project_id),
        task_id: asString(details.task_id),
        contract_id: asString(details.contract_id),
        reviewer_agent_id: null,
        reviewer_user_id: null,
        metadata: {
          derived: true,
          audit_action: row.action,
          approval_action: asString(details.approval_action),
          reviewed_by: row.actor,
        },
      } satisfies ReputationLedgerEvent];
    }

    if ((row.action === 'auth.failure' || row.action === 'authz.denied') && rowActor === normalizedActor) {
      return [{
        id: buildDerivedEventId(['audit', row.id, row.action]),
        agent_id: agentId,
        occurred_at: row.created_at,
        recorded_at: row.created_at,
        source_type: 'security_incident',
        signal_key: 'security_hygiene',
        value: row.action === 'auth.failure' ? -0.45 : -0.6,
        weight_hint: 0.9,
        source_id: row.id,
        project_id: asString(details.project_id),
        task_id: asString(details.task_id),
        contract_id: asString(details.contract_id),
        reviewer_agent_id: null,
        reviewer_user_id: null,
        metadata: {
          derived: true,
          audit_action: row.action,
          reason: asString(details.reason),
        },
      } satisfies ReputationLedgerEvent];
    }

    if ((row.action === 'suspicious.replay_detected' || row.action === 'suspicious.invalid_signature') && rowActor === normalizedActor) {
      return [{
        id: buildDerivedEventId(['audit', row.id, row.action]),
        agent_id: agentId,
        occurred_at: row.created_at,
        recorded_at: row.created_at,
        source_type: 'security_incident',
        signal_key: 'security_hygiene',
        value: -0.9,
        weight_hint: 1.3,
        source_id: row.id,
        project_id: null,
        task_id: null,
        contract_id: null,
        reviewer_agent_id: null,
        reviewer_user_id: null,
        metadata: {
          derived: true,
          audit_action: row.action,
        },
      } satisfies ReputationLedgerEvent];
    }

    if (rowActor === normalizedActor) {
      if (row.action === 'message.send' && row.resource_type === 'message') {
        return [{
          id: buildDerivedEventId(['audit', row.id, row.action]),
          agent_id: agentId,
          occurred_at: row.created_at,
          recorded_at: row.created_at,
          source_type: 'system',
          signal_key: 'collaboration_quality',
          value: 0.22,
          weight_hint: 0.15,
          source_id: row.resource_id ?? row.id,
          project_id: asString(details.project_id),
          task_id: asString(details.task_id),
          contract_id: asString(details.contract_id),
          reviewer_agent_id: null,
          reviewer_user_id: null,
          metadata: {
            derived: true,
            audit_action: row.action,
            message_type: asString(details.message_type),
            turn: details.turn ?? null,
            evidence_kind: 'contract_message_activity',
          },
        } satisfies ReputationLedgerEvent];
      }

      if (row.action === 'contract.propose' && row.resource_type === 'contract') {
        return [{
          id: buildDerivedEventId(['audit', row.id, row.action]),
          agent_id: agentId,
          occurred_at: row.created_at,
          recorded_at: row.created_at,
          source_type: 'system',
          signal_key: 'collaboration_quality',
          value: 0.4,
          weight_hint: 0.35,
          source_id: row.resource_id ?? row.id,
          project_id: asString(details.project_id),
          task_id: asString(details.task_id),
          contract_id: row.resource_id,
          reviewer_agent_id: null,
          reviewer_user_id: null,
          metadata: {
            derived: true,
            audit_action: row.action,
            invitee_count: Array.isArray(details.invitees) ? details.invitees.length : 0,
            observer_count: Array.isArray(details.observers) ? details.observers.length : 0,
            evidence_kind: 'contract_initiation',
          },
        } satisfies ReputationLedgerEvent];
      }

      if (row.action === 'contract.accept' && row.resource_type === 'contract') {
        return [{
          id: buildDerivedEventId(['audit', row.id, row.action]),
          agent_id: agentId,
          occurred_at: row.created_at,
          recorded_at: row.created_at,
          source_type: 'handoff',
          signal_key: 'collaboration_quality',
          value: asString(details.resumed_run_id) || details.handoff_claimed === true ? 0.72 : 0.58,
          weight_hint: asString(details.resumed_run_id) || details.handoff_claimed === true ? 0.8 : 0.55,
          source_id: row.resource_id ?? row.id,
          project_id: asString(details.project_id),
          task_id: asString(details.task_id),
          contract_id: row.resource_id,
          reviewer_agent_id: null,
          reviewer_user_id: null,
          metadata: {
            derived: true,
            audit_action: row.action,
            activated: details.activated === true,
            handoff_claimed: details.handoff_claimed === true,
            broker_engaged: details.broker_engaged === true,
            resumed_run_id: asString(details.resumed_run_id),
            evidence_kind: 'contract_acceptance',
          },
        } satisfies ReputationLedgerEvent];
      }

      if (row.action === 'task.update' && row.resource_type === 'task') {
        const status = asString(details.status);
        const meaningfulProgress = status === 'in-progress' || status === 'in-review' || status === 'done';
        return [{
          id: buildDerivedEventId(['audit', row.id, row.action]),
          agent_id: agentId,
          occurred_at: row.created_at,
          recorded_at: row.created_at,
          source_type: 'system',
          signal_key: meaningfulProgress ? 'delivery_reliability' : 'collaboration_quality',
          value: meaningfulProgress ? 0.34 : 0.2,
          weight_hint: meaningfulProgress ? 0.2 : 0.12,
          source_id: row.resource_id ?? row.id,
          project_id: asString(details.project_id),
          task_id: row.resource_id,
          contract_id: asString(details.handoff_contract_id) ?? asString(details.escalation_contract_id),
          reviewer_agent_id: null,
          reviewer_user_id: null,
          metadata: {
            derived: true,
            audit_action: row.action,
            status,
            priority: asString(details.priority),
            evidence_kind: meaningfulProgress ? 'task_progress_update' : 'task_maintenance_update',
          },
        } satisfies ReputationLedgerEvent];
      }

      if (row.action === 'project.member_add' && row.resource_type === 'project') {
        return [{
          id: buildDerivedEventId(['audit', row.id, row.action]),
          agent_id: agentId,
          occurred_at: row.created_at,
          recorded_at: row.created_at,
          source_type: 'system',
          signal_key: 'collaboration_quality',
          value: 0.32,
          weight_hint: 0.18,
          source_id: row.resource_id ?? row.id,
          project_id: row.resource_id,
          task_id: null,
          contract_id: null,
          reviewer_agent_id: null,
          reviewer_user_id: null,
          metadata: {
            derived: true,
            audit_action: row.action,
            role: asString(details.role),
            via: asString(details.via),
            evidence_kind: 'project_membership_gain',
          },
        } satisfies ReputationLedgerEvent];
      }
    }

    return [];
  });
}

async function getDerivedReputationLedgerEvents(agentId: string) {
  const supabase = createServerClient();
  const { data: agentRow, error: agentError } = await supabase
    .from('agents')
    .select('id, name')
    .eq('id', agentId)
    .maybeSingle();

  if (agentError) throw agentError;

  const agentName = agentRow?.name ?? null;

  const [runsRes, activityRes, auditRes] = await Promise.all([
    supabase
      .from('task_execution_runs')
      .select('id, task_id, project_id, agent_id, status, attempt, created_at, updated_at, completed_at, heartbeat_at, summary, error_message, metadata')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('task_activity_events')
      .select('id, project_id, task_id, actor_agent_id, actor_user_id, event_type, summary, metadata, created_at')
      .eq('actor_agent_id', agentId)
      .in('event_type', ['handoff_claimed', 'blocker_escalation'])
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('audit_log')
      .select('id, actor, action, resource_type, resource_id, details, created_at')
      .or(agentName ? `actor.eq.${agentName},details->>original_actor.eq.${agentName}` : `actor.eq.__never__`)
      .in('action', [
        'approval.requested',
        'approval.approved',
        'approval.denied',
        'auth.failure',
        'authz.denied',
        'suspicious.replay_detected',
        'suspicious.invalid_signature',
        'message.send',
        'contract.propose',
        'contract.accept',
        'task.update',
        'project.member_add',
      ])
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const missingRelationErrors = [runsRes.error, activityRes.error, auditRes.error].filter(
    (error): error is PostgrestError => !!error && /relation .* does not exist/i.test(error.message || '')
  );
  if (missingRelationErrors.length > 0) return [] as ReputationLedgerEvent[];
  if (runsRes.error) throw runsRes.error;
  if (activityRes.error) throw activityRes.error;
  if (auditRes.error) throw auditRes.error;

  return dedupeReputationEvents([
    ...getDerivedRunEvents(agentId, (runsRes.data || []) as TaskExecutionRunRow[]),
    ...getDerivedTaskActivityEvents(agentId, (activityRes.data || []) as TaskActivityEventRow[]),
    ...getDerivedAuditEvents(agentId, (auditRes.data || []) as AuditLogRow[], agentName),
  ]);
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
  const storedEvents = options.includeEvents ?? (await listReputationLedgerEvents(agentId, 500));
  const derivedEvents = await getDerivedReputationLedgerEvents(agentId);
  const events = dedupeReputationEvents([...storedEvents, ...derivedEvents]);
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

export async function getAgentReputationDetail(agentId: string, options: ReputationAggregationOptions = {}) {
  const result = await recomputeAgentReputation(agentId, options);
  const emptyReason = result.events.length === 0
    ? 'No automatic reputation events have been derived yet. Reputation will populate after task runs, approvals, handoff activity, or security incidents are recorded for this agent.'
    : undefined;
  const explanation = emptyReason
    ? {
        ...result.snapshot.explanation,
        gating: {
          ...result.snapshot.explanation.gating,
          reason: emptyReason,
        },
      }
    : result.snapshot.explanation;
  const detail = {
    ...result.snapshot,
    explanation,
    ledger_events: result.events,
    explanation_contract: toExplanationContract(explanation),
  };

  return {
    ...detail,
    policy_guidance: buildReputationPolicyGuidance(detail),
  };
}
