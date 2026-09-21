import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const client = readFileSync(join(process.cwd(), 'src/lib/db/client.ts'), 'utf8');

/**
 * The client returns `{ data: null, error }` rather than throwing, which is
 * right: a caller wants to decide. The cost is that a deployment fault —
 * a missing table, a role with no grant — arrives looking exactly like an
 * empty result, and callers render it as "nothing here".
 *
 * Three incidents so far: contract_links queried before it existed
 * (v1.0.316, twenty-five minutes of empty reads), pending_approvals.status
 * refused by a CHECK while the kill switch half-fired, and the operator
 * channel's tables owned by `postgres` so the app role could not read them —
 * three days of every contract reporting "no notes".
 *
 * They cannot be made to throw without changing every caller. They can be
 * made to SAY something.
 */
test('a deployment fault is logged, not silently returned as empty', () => {
  assert.match(client, /const STRUCTURAL = new Set\(\[/, 'the structural code list still exists');
  for (const code of ['42501', '42P01', '42703']) {
    assert.ok(client.includes(`'${code}'`), `${code} must be treated as structural`);
  }
  assert.match(
    client,
    /STRUCTURAL\.has\(candidate\.code\)[\s\S]{0,200}console\.error/,
    'a structural code must reach the logs before the empty result reaches the caller',
  );
});

test('ordinary errors stay quiet', () => {
  // PGRST116 is "expected one row, found N" — a normal outcome the callers
  // handle. Logging every one of those would bury the three that matter.
  assert.ok(!client.includes("STRUCTURAL.has('PGRST116')"));
  assert.ok(!/const STRUCTURAL = new Set\(\[[^\]]*PGRST/.test(client));
});
