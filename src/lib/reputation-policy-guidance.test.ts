import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReputationPolicyGuidance } from './reputation-policy-guidance';
import type { AgentReputationDetail } from './types';

function makeReputation(overrides: Partial<AgentReputationDetail>): AgentReputationDetail {
  return {
    agent_id: 'agent-1',
    score_version: 1,
    score: 0.8,
    confidence: 0.9,
    confidence_band: 'high',
    stable: true,
    signals: [],
    explanation: {
      score_version: 1,
      score: 0.8,
      confidence: 0.9,
      confidence_band: 'high',
      gating: {
        minimum_events_for_provisional: 3,
        minimum_events_for_stable: 12,
        observed_events: 20,
        is_visible: true,
        is_stable: true,
      },
      decay: {
        half_life_days: 30,
        stale_after_days: 90,
        evaluated_at: new Date().toISOString(),
        newest_event_at: new Date().toISOString(),
      },
      signals: [],
      adjustments: {
        anti_gaming_penalty: 0,
        manual_review_only: false,
        reasons: [],
      },
    },
    calculated_at: new Date().toISOString(),
    ledger_events: [],
    ...overrides,
  };
}

test('guidance stays advisory when score is not yet visible', () => {
  const guidance = buildReputationPolicyGuidance(makeReputation({
    score: null,
    confidence_band: 'low',
    explanation: {
      ...makeReputation({}).explanation,
      score: null,
      confidence_band: 'low',
      gating: {
        minimum_events_for_provisional: 3,
        minimum_events_for_stable: 12,
        observed_events: 1,
        is_visible: false,
        is_stable: false,
        reason: 'Not enough reputation events to show a score yet',
      },
    },
  }));

  assert.equal(guidance.advisory_only, true);
  assert.equal(guidance.recommended_posture, 'standard');
  assert.match(guidance.items[0]?.recommendation ?? '', /Do not change workflow/i);
});

test('guidance recommends manual review without enforcement', () => {
  const guidance = buildReputationPolicyGuidance(makeReputation({
    score: 0.31,
    explanation: {
      ...makeReputation({}).explanation,
      score: 0.31,
      adjustments: {
        anti_gaming_penalty: 0.08,
        manual_review_only: true,
        reasons: ['Repeated severe security incidents'],
      },
    },
  }));

  assert.equal(guidance.recommended_posture, 'manual-review');
  assert.ok(guidance.items.some((item) => item.id === 'manual-review-hold'));
  assert.ok(guidance.items.every((item) => !/block|deny access/i.test(item.recommendation)));
});
