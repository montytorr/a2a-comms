import assert from 'node:assert/strict';
import test from 'node:test';
import { compileScalarFilter, normalizeDatabaseValue } from './client';

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

/* `.not(col, 'is', null)` compiled to `col is null` — the exact inverse —
   because the `is` branch matched first and the `is not` branch below it was
   unreachable, while the trailing `not (...)` wrapper deliberately skips
   `is`. It returned the wrong rows silently: the dashboard reported no
   webhook delivery while two had just fired, and the stale-blocker sweep
   walked tasks that were never blocked. */
test('.not(column, is, null) compiles to IS NOT NULL, not IS NULL', () => {
  const parameters: unknown[] = [];
  assert.equal(
    compileScalarFilter({ column: 'last_delivery_at', operator: 'is', value: null, negate: true }, 'b.last_delivery_at', parameters),
    'b.last_delivery_at is not null',
  );
  assert.deepEqual(parameters, []);
});

test('.is(column, null) still compiles to IS NULL', () => {
  assert.equal(
    compileScalarFilter({ column: 'blocked_at', operator: 'is', value: null }, 'b.blocked_at', []),
    'b.blocked_at is null',
  );
});

test('negated boolean IS filters invert too', () => {
  assert.equal(
    compileScalarFilter({ column: 'active', operator: 'is', value: true, negate: true }, 'b.active', []),
    'b.active is not true',
  );
  assert.equal(
    compileScalarFilter({ column: 'active', operator: 'is', value: false }, 'b.active', []),
    'b.active is false',
  );
});

test('other negated operators keep their not (...) wrapper', () => {
  const parameters: unknown[] = [];
  assert.equal(
    compileScalarFilter({ column: 'status', operator: '=', value: 'done', negate: true }, 'b.status', parameters),
    'not (b.status = $1)',
  );
  assert.deepEqual(parameters, ['done']);
});
