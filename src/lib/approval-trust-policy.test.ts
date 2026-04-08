import test from 'node:test';
import assert from 'node:assert/strict';
import { getApprovalScope } from './email/helpers';

test('approval scope treats both kill_switch and killswitch actions as admin-scoped', () => {
  assert.equal(getApprovalScope('kill_switch.activate'), 'admin');
  assert.equal(getApprovalScope('killswitch.activate'), 'admin');
  assert.equal(getApprovalScope('platform.freeze'), 'admin');
  assert.equal(getApprovalScope('key.rotate'), 'owner');
});

test('approval API route uses centralized trust visibility policy', async () => {
  const { readFile } = await import('node:fs/promises');
  const route = await readFile(new URL('../app/api/v1/approvals/route.ts', import.meta.url), 'utf8');

  assert.match(route, /getApprovalVisibilityForAgent/);
  assert.match(route, /visibility\.allowedApprovalIds/);
  assert.match(route, /query = query\.in\('id', visibility\.allowedApprovalIds\)/);
  assert.match(route, /query = query\.eq\('actor', auth\.agent\.name\)/);
});
