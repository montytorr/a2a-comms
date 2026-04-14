import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentScope } from './auth-actor-context';
import { getAuthUser } from './auth-context';

test('buildAgentScope falls back to empty UUID when no agent ids exist', () => {
  assert.deepEqual(buildAgentScope([]), ['00000000-0000-0000-0000-000000000000']);
  assert.deepEqual(buildAgentScope(['agent-1']), ['agent-1']);
});

test('getAuthUser source exposes owned agent identities for acting-agent selection', () => {
  const source = getAuthUser.toString();

  assert.match(source, /agents:\s*normalizedAgents/);
  assert.match(source, /name:/);
  assert.match(source, /displayName:/);
});
