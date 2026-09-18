import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PULSE_KEYS,
  PULSE_UNAVAILABLE,
  changedKeys,
  isUnavailable,
  type Pulse,
  type PulseKey,
} from '@/lib/pulse';

const ALL = PULSE_KEYS;
const base: Pulse = Object.fromEntries(ALL.map((k) => [k, `${k}-v1`])) as Pulse;
const moved = (key: PulseKey): Pulse => ({ ...base, [key]: `${key}-v2` });

test('the vocabulary covers every domain a page displays', () => {
  assert.deepEqual([...ALL], [
    'contracts', 'participants', 'messages', 'tasks',
    'projects', 'approvals', 'agents', 'audit', 'webhooks',
  ]);
});

test('nothing moving means nothing to refresh', () => {
  assert.deepEqual(changedKeys(base, base, ALL), []);
});

test('a key that moved is reported, and only that key', () => {
  assert.deepEqual(changedKeys(base, moved('messages'), ALL), ['messages']);
});

test('a page only hears about what it watches', () => {
  // A contract page must not re-render because a webhook was delivered.
  assert.deepEqual(changedKeys(base, moved('webhooks'), ['contracts', 'participants']), []);
  assert.deepEqual(changedKeys(base, moved('participants'), ['contracts', 'participants']), ['participants']);
});

test('an invitation being accepted moves the participants key', () => {
  // The transition that started this: accepted in another agent's session,
  // invisible in an open tab until a manual reload.
  const before: Pulse = { ...base, participants: '2026-09-18 10:00:00+00/84/73' };
  const after: Pulse = { ...base, participants: '2026-09-18 10:05:00+00/84/74' };
  assert.deepEqual(changedKeys(before, after, ['participants']), ['participants']);
});

test('an unavailable reading reports no change, in either direction', () => {
  // A database blip must not refresh every open tab on every tick.
  assert.deepEqual(changedKeys(PULSE_UNAVAILABLE, base, ALL), []);
  assert.deepEqual(changedKeys(base, PULSE_UNAVAILABLE, ALL), []);
  assert.deepEqual(changedKeys(PULSE_UNAVAILABLE, PULSE_UNAVAILABLE, ALL), []);
});

test('recovering from an unavailable reading does not look like everything changed', () => {
  // The first good reading after an outage is compared against the sentinel,
  // which yields nothing; the reading after that is compared normally.
  assert.deepEqual(changedKeys(PULSE_UNAVAILABLE, base, ALL), []);
  assert.deepEqual(changedKeys(base, moved('tasks'), ALL), ['tasks']);
});

test('the sentinel is recognisable and frozen', () => {
  assert.equal(isUnavailable(PULSE_UNAVAILABLE), true);
  assert.equal(isUnavailable(base), false);
  assert.throws(() => {
    (PULSE_UNAVAILABLE as Record<string, string>).contracts = 'x';
  }, 'the sentinel must not be mutable — every caller shares it');
});

test('a key absent from both sides is not a change', () => {
  assert.deepEqual(changedKeys({ contracts: 'a' }, { contracts: 'a' }, ['contracts', 'tasks']), []);
});

test('a key appearing for the first time is a change', () => {
  assert.deepEqual(changedKeys({ contracts: 'a', tasks: 'x' }, { contracts: 'a', tasks: 'y' }, ['tasks']), ['tasks']);
});
