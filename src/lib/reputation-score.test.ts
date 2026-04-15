import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REPUTATION_DEFAULT_HALF_LIFE_DAYS,
  REPUTATION_FULL_CONFIDENCE_EVENT_COUNT,
  REPUTATION_MIN_EVENTS_FOR_PROVISIONAL,
  REPUTATION_MIN_EVENTS_FOR_STABLE,
  REPUTATION_SIGNAL_WEIGHTS,
  REPUTATION_STALE_AFTER_DAYS,
  REPUTATION_WEIGHT_SUM,
  getReputationConfidenceBand,
} from './reputation-score';

test('reputation weights sum to 1.00', () => {
  assert.equal(REPUTATION_SIGNAL_WEIGHTS.length, 4);
  assert.equal(Number(REPUTATION_WEIGHT_SUM.toFixed(6)), 1);
});

test('reputation thresholds stay ordered and positive', () => {
  assert.ok(REPUTATION_MIN_EVENTS_FOR_PROVISIONAL > 0);
  assert.ok(REPUTATION_MIN_EVENTS_FOR_STABLE > REPUTATION_MIN_EVENTS_FOR_PROVISIONAL);
  assert.ok(REPUTATION_FULL_CONFIDENCE_EVENT_COUNT >= REPUTATION_MIN_EVENTS_FOR_STABLE);
  assert.ok(REPUTATION_DEFAULT_HALF_LIFE_DAYS > 0);
  assert.ok(REPUTATION_STALE_AFTER_DAYS > REPUTATION_DEFAULT_HALF_LIFE_DAYS);
});

test('confidence band mapping is stable', () => {
  assert.equal(getReputationConfidenceBand(0), 'none');
  assert.equal(getReputationConfidenceBand(0.2), 'low');
  assert.equal(getReputationConfidenceBand(0.5), 'medium');
  assert.equal(getReputationConfidenceBand(0.9), 'high');
});
