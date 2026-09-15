import test from 'node:test';
import assert from 'node:assert/strict';
import { validTimestamp } from './live-feed';

test('accepts PostgreSQL timestamptz Date values', () => {
  const value = new Date('2026-09-15T09:18:57.251Z');
  assert.equal(validTimestamp(value), '2026-09-15T09:18:57.251Z');
});

test('rejects invalid Date values', () => {
  assert.equal(validTimestamp(new Date('invalid')), null);
});
