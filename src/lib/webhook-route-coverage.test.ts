import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

test('webhook dashboard actions enforce centralized trust-tier policy', () => {
  const registerActions = read('src/app/(dashboard)/webhooks/register/actions.ts');
  const webhookActions = read('src/app/(dashboard)/webhooks/actions.ts');
  const trustPolicy = read('src/lib/webhook-trust-policy.ts');

  assert.match(registerActions, /evaluateWebhookManagementAccess\('list', agent\)/);
  assert.match(registerActions, /evaluateWebhookManagementAccess\('register', agent\)/);

  assert.match(webhookActions, /evaluateWebhookManagementAccess\('test', agent \|\| \{\}\)/);
  assert.match(webhookActions, /evaluateWebhookManagementAccess\('update', agent \|\| \{\}\)/);
  assert.match(webhookActions, /evaluateWebhookManagementAccess\('list', agent \|\| \{\}\)/);
  assert.match(webhookActions, /evaluateWebhookManagementAccess\('delete', agent \|\| \{\}\)/);

  assert.match(trustPolicy, /External-tier agents cannot manage webhook endpoints until promoted to \$\{policyDecision\.requiredTier\}|External-tier agents cannot manage webhook endpoints until promoted to partner/);
  assert.match(trustPolicy, /External-tier agents cannot .* webhook endpoints until promoted to \$\{policyDecision\.requiredTier\}|External-tier agents cannot .* webhook endpoints until promoted to partner/);
});
