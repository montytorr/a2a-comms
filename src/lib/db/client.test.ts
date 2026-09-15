import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDatabaseValue } from './client';

test('normalizes PostgreSQL Date values to the PostgREST ISO timestamp shape', () => {
  const createdAt = new Date('2026-09-15T09:18:57.251Z');
  const value = normalizeDatabaseValue({
    created_at: createdAt,
    nested: [{ updated_at: createdAt }],
    nullable: null,
  });

  assert.deepEqual(value, {
    created_at: '2026-09-15T09:18:57.251Z',
    nested: [{ updated_at: '2026-09-15T09:18:57.251Z' }],
    nullable: null,
  });
});

test('rejects invalid PostgreSQL Date values instead of emitting an invalid timestamp', () => {
  assert.throws(() => normalizeDatabaseValue(new Date('invalid')), RangeError);
});
