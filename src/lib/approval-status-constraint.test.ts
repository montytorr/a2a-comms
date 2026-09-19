import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

/**
 * The status the application writes must be a status the database accepts.
 *
 * It was not. `pending_approvals_status_check` allowed pending|approved|denied
 * while consumeApproval() wrote 'consumed', and the db client turns a
 * constraint violation into `{data: null, error}` instead of throwing — so the
 * write failed silently and the caller only saw a null. In activateKillSwitch()
 * that null lands after the kill switch is already on and before the contracts
 * are closed, and becomes a throw. The platform ends up half-killed and every
 * retry fails identically.
 */
function allowedStatuses(): string[] {
  const dir = join(root, 'migrations');
  // Later migrations redefine the constraint, so the last definition wins —
  // exactly as applying them in order would.
  let latest: string[] | null = null;
  for (const file of readdirSync(dir).sort()) {
    const sql = readFileSync(join(dir, file), 'utf8');
    const re = /pending_approvals[\s\S]{0,400}?status\s+(?:IN|=\s*ANY)\s*\(?\s*(?:ARRAY)?\s*\[?([^)\]]*)[)\]]/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) {
      const values = m[1].match(/'([a-z_]+)'/g);
      if (values) latest = values.map((v) => v.replace(/'/g, ''));
    }
  }
  assert.ok(latest, 'no CHECK on pending_approvals.status found in any migration');
  return latest;
}

function declaredStatuses(): string[] {
  const src = readFileSync(join(root, 'src/lib/approvals.ts'), 'utf8');
  const m = src.match(/interface PendingApproval[\s\S]*?status:\s*([^;]+);/);
  assert.ok(m, 'PendingApproval.status not found');
  return (m[1].match(/'([a-z_]+)'/g) ?? []).map((v) => v.replace(/'/g, ''));
}

test('every approval status the code declares is one the database allows', () => {
  const allowed = new Set(allowedStatuses());
  const rejected = declaredStatuses().filter((s) => !allowed.has(s));
  assert.deepEqual(rejected, [], `the CHECK constraint would refuse: ${rejected.join(', ')}`);
});

test('consumeApproval writes a status the constraint permits', () => {
  const src = readFileSync(join(root, 'src/lib/approvals.ts'), 'utf8');
  const allowed = new Set(allowedStatuses());
  const written = [...src.matchAll(/status:\s*'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(written.includes('consumed'), 'expected consumeApproval to still write consumed');
  const rejected = [...new Set(written)].filter((s) => !allowed.has(s));
  assert.deepEqual(rejected, [], `approvals.ts writes statuses the database refuses: ${rejected.join(', ')}`);
});


/**
 * The same class of bug, on a different table.
 *
 * webhook_deliveries declared CHECK (status IN ('pending','success','failed'))
 * and no migration widened it, while src/lib/webhooks.ts writes 'pending_retry'
 * and 'retrying'. Production accepts them only because the constraint was
 * widened there by hand and never came back into the ledger — so the live
 * database and this repo disagreed, and a fresh deploy would have silently
 * stopped retrying failed deliveries.
 */
test('every webhook delivery status the code writes is one the database allows', () => {
  const dir = join(root, 'migrations');
  let allowed: string[] | null = null;
  for (const file of readdirSync(dir).sort()) {
    const sql = readFileSync(join(dir, file), 'utf8');
    const re = /webhook_deliveries[\s\S]{0,600}?status\s+(?:IN|=\s*ANY)\s*\(?\s*(?:ARRAY)?\s*\[?([^)\]]*)[)\]]/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) {
      const values = m[1].match(/'([a-z_]+)'/g);
      if (values) allowed = values.map((v) => v.replace(/'/g, ''));
    }
  }
  assert.ok(allowed, 'no CHECK on webhook_deliveries.status found in any migration');

  const src = readFileSync(join(root, 'src/lib/webhooks.ts'), 'utf8');
  const written = [...src.matchAll(/status:\s*'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(written.includes('pending_retry'), 'expected webhooks.ts to still write pending_retry');

  const rejected = [...new Set(written)].filter((s) => !allowed!.includes(s));
  assert.deepEqual(rejected, [], `webhooks.ts writes statuses the database refuses: ${rejected.join(', ')}`);
});
