import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateReputationLedger, detectBurstPenalty } from './reputation-ledger';
import type { ReputationLedgerEvent } from './types';

function buildEvent(overrides: Partial<ReputationLedgerEvent>): ReputationLedgerEvent {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    agent_id: overrides.agent_id ?? 'agent-1',
    occurred_at: overrides.occurred_at ?? '2026-04-10T12:00:00.000Z',
    recorded_at: overrides.recorded_at ?? overrides.occurred_at ?? '2026-04-10T12:00:00.000Z',
    source_type: overrides.source_type ?? 'task_run',
    signal_key: overrides.signal_key ?? 'delivery_reliability',
    value: overrides.value ?? 0.8,
    weight_hint: overrides.weight_hint ?? null,
    source_id: overrides.source_id ?? null,
    project_id: overrides.project_id ?? null,
    task_id: overrides.task_id ?? null,
    contract_id: overrides.contract_id ?? null,
    reviewer_agent_id: overrides.reviewer_agent_id ?? null,
    reviewer_user_id: overrides.reviewer_user_id ?? null,
    metadata: overrides.metadata ?? {},
  };
}

test('aggregateReputationLedger hides score when too few events exist', () => {
  const { snapshot } = aggregateReputationLedger({
    agentId: 'agent-1',
    evaluatedAt: '2026-04-11T06:00:00.000Z',
    events: [
      buildEvent({ id: 'e1', signal_key: 'delivery_reliability', value: 0.8 }),
      buildEvent({ id: 'e2', signal_key: 'approval_outcomes', value: 0.5, occurred_at: '2026-04-09T06:00:00.000Z' }),
    ],
  });

  assert.equal(snapshot.score, null);
  assert.equal(snapshot.confidence_band, 'none');
  assert.equal(snapshot.explanation.gating.is_visible, false);
});

test('aggregateReputationLedger computes stable score and signal breakdown', () => {
  const events: ReputationLedgerEvent[] = [
    buildEvent({ id: 'e1', signal_key: 'delivery_reliability', value: 0.9, project_id: 'p1' }),
    buildEvent({ id: 'e2', signal_key: 'delivery_reliability', value: 0.7, project_id: 'p2', occurred_at: '2026-04-08T06:00:00.000Z' }),
    buildEvent({ id: 'e3', signal_key: 'approval_outcomes', value: 0.8, reviewer_user_id: 'u1' }),
    buildEvent({ id: 'e4', signal_key: 'approval_outcomes', value: 0.6, reviewer_user_id: 'u2', occurred_at: '2026-04-07T06:00:00.000Z' }),
    buildEvent({ id: 'e5', signal_key: 'collaboration_quality', value: 0.9, contract_id: 'c1' }),
    buildEvent({ id: 'e6', signal_key: 'collaboration_quality', value: 0.7, contract_id: 'c2', occurred_at: '2026-04-06T06:00:00.000Z' }),
    buildEvent({ id: 'e7', signal_key: 'security_hygiene', value: -0.2, source_type: 'security_incident' }),
    buildEvent({ id: 'e8', signal_key: 'security_hygiene', value: 0.4, source_type: 'security_incident', occurred_at: '2026-04-05T06:00:00.000Z' }),
    buildEvent({ id: 'e9', signal_key: 'delivery_reliability', value: 0.8, project_id: 'p3', occurred_at: '2026-04-03T06:00:00.000Z' }),
    buildEvent({ id: 'e10', signal_key: 'collaboration_quality', value: 0.8, contract_id: 'c3', occurred_at: '2026-04-02T06:00:00.000Z' }),
    buildEvent({ id: 'e11', signal_key: 'approval_outcomes', value: 0.7, reviewer_user_id: 'u5', occurred_at: '2026-04-01T06:00:00.000Z' }),
    buildEvent({ id: 'e12', signal_key: 'security_hygiene', value: 0.1, source_type: 'security_incident', occurred_at: '2026-03-31T06:00:00.000Z' }),
  ];

  const { snapshot } = aggregateReputationLedger({
    agentId: 'agent-1',
    evaluatedAt: '2026-04-11T06:00:00.000Z',
    events,
  });

  assert.ok(snapshot.score !== null);
  assert.equal(snapshot.explanation.gating.is_visible, true);
  assert.equal(snapshot.explanation.gating.is_stable, true);
  assert.equal(snapshot.signals.length, 4);
  assert.ok(snapshot.confidence >= 0.3);
  assert.match(JSON.stringify(snapshot.explanation), /delivery_reliability/);
  assert.equal(snapshot.score, 0.7961);
});

test('aggregateReputationLedger ignores unobserved components instead of treating them as zero-score penalties', () => {
  const events: ReputationLedgerEvent[] = [
    buildEvent({ id: 'e1', signal_key: 'delivery_reliability', value: 0.9, project_id: 'p1' }),
    buildEvent({ id: 'e2', signal_key: 'delivery_reliability', value: 0.7, project_id: 'p2', occurred_at: '2026-04-08T06:00:00.000Z' }),
    buildEvent({ id: 'e3', signal_key: 'delivery_reliability', value: 0.8, project_id: 'p3', occurred_at: '2026-04-03T06:00:00.000Z' }),
  ];

  const { snapshot } = aggregateReputationLedger({
    agentId: 'agent-1',
    evaluatedAt: '2026-04-11T06:00:00.000Z',
    events,
  });

  assert.equal(snapshot.explanation.gating.is_visible, true);
  assert.equal(snapshot.explanation.gating.is_stable, false);
  assert.equal(snapshot.score, 0.9422);
  assert.equal(snapshot.signals.find((signal) => signal.key === 'delivery_reliability')?.weighted_contribution, 0.3153);
  assert.equal(snapshot.signals.find((signal) => signal.key === 'approval_outcomes')?.sample_count, 0);
  assert.equal(snapshot.signals.find((signal) => signal.key === 'approval_outcomes')?.weighted_contribution, 0);
  assert.equal(snapshot.signals.find((signal) => signal.key === 'security_hygiene')?.value, 1);
  assert.equal(snapshot.signals.find((signal) => signal.key === 'security_hygiene')?.weighted_contribution, 0.25);
  assert.equal(snapshot.confidence_band, 'low');
});

test('aggregateReputationLedger applies burst penalty and manual review hold for repeated severe security events', () => {
  const events: ReputationLedgerEvent[] = Array.from({ length: 4 }, (_, index) =>
    buildEvent({
      id: `s${index}`,
      signal_key: 'security_hygiene',
      source_type: 'security_incident',
      value: -1,
      source_id: `incident-burst-${index}`,
      occurred_at: `2026-04-10T0${index}:00:00.000Z`,
    })
  ).concat(
    Array.from({ length: 8 }, (_, index) =>
      buildEvent({
        id: `d${index}`,
        signal_key: 'delivery_reliability',
        value: 1,
        source_id: `run-burst-${index}`,
        occurred_at: `2026-04-10T1${index % 10}:00:00.000Z`,
      })
    )
  );

  const adjustment = detectBurstPenalty(events, '2026-04-11T06:00:00.000Z');
  const { snapshot } = aggregateReputationLedger({
    agentId: 'agent-1',
    evaluatedAt: '2026-04-11T06:00:00.000Z',
    events,
  });

  assert.ok(adjustment.antiGamingPenalty > 0);
  assert.deepEqual(snapshot.explanation.adjustments, {
    anti_gaming_penalty: adjustment.antiGamingPenalty,
    manual_review_only: adjustment.manualReviewOnly,
    reasons: adjustment.reasons,
  });
  assert.equal(adjustment.manualReviewOnly, true);
  assert.ok(snapshot.score !== null && snapshot.score < 0.6);
});

test('aggregateReputationLedger treats derived execution, approval, collaboration, and security events like normal ledger evidence', () => {
  const events: ReputationLedgerEvent[] = [
    buildEvent({
      id: 'derived:run-success',
      source_type: 'task_run',
      signal_key: 'delivery_reliability',
      value: 0.8,
      metadata: { derived: true, status: 'succeeded' },
      project_id: 'p1',
      task_id: 't1',
    }),
    buildEvent({
      id: 'derived:approval-approved',
      source_type: 'approval',
      signal_key: 'approval_outcomes',
      value: 0.85,
      metadata: { derived: true, audit_action: 'approval.approved' },
      project_id: 'p1',
      task_id: 't1',
    }),
    buildEvent({
      id: 'derived:handoff-claimed',
      source_type: 'handoff',
      signal_key: 'collaboration_quality',
      value: 0.75,
      metadata: { derived: true, event_type: 'handoff_claimed' },
      project_id: 'p2',
      task_id: 't2',
      contract_id: 'c1',
    }),
    buildEvent({
      id: 'derived:security-denied',
      source_type: 'security_incident',
      signal_key: 'security_hygiene',
      value: -0.6,
      metadata: { derived: true, audit_action: 'authz.denied' },
      project_id: 'p3',
      task_id: 't3',
    }),
  ];

  const { snapshot } = aggregateReputationLedger({
    agentId: 'agent-1',
    evaluatedAt: '2026-04-11T06:00:00.000Z',
    events,
  });

  assert.equal(snapshot.explanation.gating.is_visible, true);
  assert.ok(snapshot.score !== null);
  assert.equal(snapshot.signals.find((signal) => signal.key === 'delivery_reliability')?.sample_count, 1);
  assert.equal(snapshot.signals.find((signal) => signal.key === 'approval_outcomes')?.sample_count, 1);
  assert.equal(snapshot.signals.find((signal) => signal.key === 'collaboration_quality')?.sample_count, 1);
  assert.equal(snapshot.signals.find((signal) => signal.key === 'security_hygiene')?.sample_count, 1);
});

test('aggregateReputationLedger gives provisional credit to low-weight audit-derived activity without inflating scores', () => {
  const events: ReputationLedgerEvent[] = [
    buildEvent({
      id: 'derived:message-send',
      source_type: 'system',
      signal_key: 'collaboration_quality',
      value: 0.22,
      weight_hint: 0.15,
      metadata: { derived: true, audit_action: 'message.send', evidence_kind: 'contract_message_activity' },
      contract_id: 'c1',
      project_id: 'p1',
    }),
    buildEvent({
      id: 'derived:contract-propose',
      source_type: 'system',
      signal_key: 'collaboration_quality',
      value: 0.4,
      weight_hint: 0.35,
      metadata: { derived: true, audit_action: 'contract.propose', evidence_kind: 'contract_initiation' },
      contract_id: 'c1',
      project_id: 'p1',
      occurred_at: '2026-04-10T11:00:00.000Z',
    }),
    buildEvent({
      id: 'derived:contract-accept',
      source_type: 'handoff',
      signal_key: 'collaboration_quality',
      value: 0.58,
      weight_hint: 0.55,
      metadata: { derived: true, audit_action: 'contract.accept', evidence_kind: 'contract_acceptance' },
      contract_id: 'c1',
      project_id: 'p1',
      occurred_at: '2026-04-10T10:00:00.000Z',
    }),
    buildEvent({
      id: 'derived:task-update',
      source_type: 'system',
      signal_key: 'delivery_reliability',
      value: 0.34,
      weight_hint: 0.2,
      metadata: { derived: true, audit_action: 'task.update', evidence_kind: 'task_progress_update', status: 'done' },
      task_id: 't1',
      project_id: 'p1',
      occurred_at: '2026-04-10T09:00:00.000Z',
    }),
    buildEvent({
      id: 'derived:member-add',
      source_type: 'system',
      signal_key: 'collaboration_quality',
      value: 0.32,
      weight_hint: 0.18,
      metadata: { derived: true, audit_action: 'project.member_add', evidence_kind: 'project_membership_gain' },
      project_id: 'p2',
      occurred_at: '2026-04-10T08:00:00.000Z',
    }),
  ];

  const { snapshot } = aggregateReputationLedger({
    agentId: 'agent-1',
    evaluatedAt: '2026-04-11T06:00:00.000Z',
    events,
  });

  assert.equal(snapshot.explanation.gating.is_visible, true);
  assert.equal(snapshot.explanation.gating.is_stable, false);
  assert.equal(snapshot.confidence_band, 'low');
  assert.ok(snapshot.score !== null);
  assert.ok(snapshot.score >= 0.7 && snapshot.score <= 0.85);
  assert.equal(snapshot.signals.find((signal) => signal.key === 'collaboration_quality')?.sample_count, 4);
  assert.equal(snapshot.signals.find((signal) => signal.key === 'delivery_reliability')?.sample_count, 1);
  assert.equal(snapshot.signals.find((signal) => signal.key === 'approval_outcomes')?.sample_count, 0);
  assert.equal(snapshot.signals.find((signal) => signal.key === 'security_hygiene')?.value, 1);
});

test('security_hygiene implicit positive does NOT fire when agent has fewer than 3 total events', () => {
  const events: ReputationLedgerEvent[] = [
    buildEvent({ id: 'e1', signal_key: 'delivery_reliability', value: 0.8, project_id: 'p1' }),
    buildEvent({ id: 'e2', signal_key: 'collaboration_quality', value: 0.7, occurred_at: '2026-04-09T06:00:00.000Z' }),
  ];

  const { snapshot } = aggregateReputationLedger({
    agentId: 'agent-1',
    evaluatedAt: '2026-04-11T06:00:00.000Z',
    events,
  });

  assert.equal(snapshot.score, null);
  assert.equal(snapshot.signals.find((signal) => signal.key === 'security_hygiene')?.value, 0);
  assert.equal(snapshot.signals.find((signal) => signal.key === 'security_hygiene')?.weighted_contribution, 0);
});

test('security_hygiene implicit positive is replaced when a real security incident arrives', () => {
  const events: ReputationLedgerEvent[] = [
    buildEvent({ id: 'e1', signal_key: 'delivery_reliability', value: 0.9, project_id: 'p1' }),
    buildEvent({ id: 'e2', signal_key: 'delivery_reliability', value: 0.8, project_id: 'p2', occurred_at: '2026-04-09T06:00:00.000Z' }),
    buildEvent({ id: 'e3', signal_key: 'collaboration_quality', value: 0.7, occurred_at: '2026-04-08T06:00:00.000Z' }),
    buildEvent({
      id: 'e4',
      signal_key: 'security_hygiene',
      source_type: 'security_incident',
      value: -0.6,
      occurred_at: '2026-04-10T12:00:00.000Z',
    }),
  ];

  const { snapshot } = aggregateReputationLedger({
    agentId: 'agent-1',
    evaluatedAt: '2026-04-11T06:00:00.000Z',
    events,
  });

  assert.equal(snapshot.signals.find((signal) => signal.key === 'security_hygiene')?.sample_count, 1);
  assert.ok(snapshot.signals.find((signal) => signal.key === 'security_hygiene')!.value < 0.5);
  assert.ok(snapshot.score !== null && snapshot.score < 0.85);
});
