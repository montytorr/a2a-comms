import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentUpdateFields, AgentLifecycleError } from './agent-lifecycle';

test('buildAgentUpdateFields normalizes supported agent lifecycle fields', () => {
  const updates = buildAgentUpdateFields({
    capabilities: ['contracts', 'webhooks'],
    protocols: ['a2a-comms-v1'],
    max_concurrent_contracts: 7,
    description: 'updated',
    trust_tier: 'partner',
    trust_notes: 'ok',
    privacy_metadata: { retention_days: 14 },
  });

  assert.deepEqual(updates.capabilities, ['contracts', 'webhooks']);
  assert.deepEqual(updates.protocols, ['a2a-comms-v1']);
  assert.equal(updates.max_concurrent_contracts, 7);
  assert.equal(updates.description, 'updated');
  assert.equal(updates.trust_tier, 'partner');
  assert.equal(updates.trust_notes, 'ok');
  assert.deepEqual(updates.privacy_metadata, {
    version: 1,
    data_handling: 'standard',
    retention_days: 14,
    allow_training: false,
    allow_operator_exports: true,
    redaction_level: 'standard',
  });
});

test('agent lifecycle error carries status and code', () => {
  const error = new AgentLifecycleError('nope', 'BAD', 409);
  assert.equal(error.message, 'nope');
  assert.equal(error.code, 'BAD');
  assert.equal(error.status, 409);
});

test('agent route supports lifecycle deactivation fields', async () => {
  const routeModule = await import('../app/api/v1/agents/[id]/route');
  const source = routeModule.PATCH.toString();

  assert.match(source, /deactivate:parsed\.deactivate/);
  assert.match(source, /deactivate_reason:parsed\.deactivate_reason/);
  assert.match(source, /updateAgentLifecycle/);
});

test('agent registration route provisions a service key through lifecycle helper', async () => {
  const routeModule = await import('../app/api/v1/agents/route');
  const source = routeModule.POST.toString();

  assert.match(source, /createAgentWithServiceKey/);
  assert.match(source, /service_key/);
});
