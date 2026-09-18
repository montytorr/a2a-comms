import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RELOAD_BUDGET,
  RELOAD_WINDOW_MS,
  STALE_AFTER_TICKS,
  canReload,
  decideAction,
  isStale,
  recentReloads,
} from '@/lib/refresh-watchdog';

const NOW = 1_800_000_000_000;

const decide = (over: Partial<Parameters<typeof decideAction>[0]> = {}) =>
  decideAction({
    visible: true,
    sinceServerRenderMs: 0,
    intervalMs: 15_000,
    build: 'same',
    reloadLog: [],
    now: NOW,
    ...over,
  });

test('a page is only stale after several missed refreshes, not one slow one', () => {
  assert.equal(isStale(15_000, 15_000), false);
  assert.equal(isStale(15_000 * STALE_AFTER_TICKS, 15_000), false, 'exactly at the threshold is not yet stale');
  assert.equal(isStale(15_000 * STALE_AFTER_TICKS + 1, 15_000), true);
});

test('staleness scales with the page\'s own interval', () => {
  // A 30s page must not be called stale on a 10s page's budget.
  assert.equal(isStale(45_000, 30_000), false);
  assert.equal(isStale(45_000, 10_000), true);
});

test('a hidden tab owes nothing', () => {
  // Nothing was refreshing while hidden, so elapsed time is not evidence.
  assert.equal(decide({ visible: false, sinceServerRenderMs: 10 * 60_000 }), 'idle');
  assert.equal(decide({ visible: false, build: 'moved' }), 'idle');
});

test('a moved build reloads, even when the page does not look stale', () => {
  // This is the whole point: the page looks fine right up until it freezes.
  assert.equal(decide({ build: 'moved', sinceServerRenderMs: 0 }), 'reload');
});

test('a stale page on the same build keeps refreshing rather than reloading', () => {
  // Refreshes failing against a reachable server is not a skew; spending the
  // reload budget on it achieves nothing.
  assert.equal(decide({ sinceServerRenderMs: 999_999, build: 'same' }), 'refresh');
});

test('a build check that could not be made is not treated as a skew', () => {
  assert.equal(decide({ sinceServerRenderMs: 999_999, build: 'unknown' }), 'refresh');
});

test('the reload budget is spent before it gives up', () => {
  const log = [NOW - 1000, NOW - 2000];
  assert.equal(log.length < RELOAD_BUDGET, true);
  assert.equal(decide({ build: 'moved', reloadLog: log }), 'reload');
});

test('a spent budget gives up rather than looping', () => {
  const log = [NOW - 1000, NOW - 2000, NOW - 3000];
  assert.equal(log.length, RELOAD_BUDGET);
  assert.equal(decide({ build: 'moved', reloadLog: log }), 'give-up');
});

test('reloads outside the window do not count against the budget', () => {
  const old = [NOW - RELOAD_WINDOW_MS - 1, NOW - RELOAD_WINDOW_MS - 2, NOW - RELOAD_WINDOW_MS - 3];
  assert.deepEqual(recentReloads(old, NOW), []);
  assert.equal(canReload(old, NOW), true);
  assert.equal(decide({ build: 'moved', reloadLog: old }), 'reload');
});

test('a reload exactly at the window edge has expired', () => {
  assert.deepEqual(recentReloads([NOW - RELOAD_WINDOW_MS], NOW), []);
});
