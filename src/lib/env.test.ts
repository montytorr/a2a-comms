import assert from 'node:assert/strict';
import test from 'node:test';
import { readEnv } from './env';

test('the HOLLOWAY_ name wins over the legacy A2A_ name', () => {
  assert.equal(readEnv('BASE_URL', { HOLLOWAY_BASE_URL: 'new', A2A_BASE_URL: 'old' }), 'new');
});

test('a server configured before the rename keeps working on A2A_ alone', () => {
  assert.equal(readEnv('ATTACHMENT_SIGNING_KEY', { A2A_ATTACHMENT_SIGNING_KEY: 'old' }), 'old');
});

test('an empty value counts as unset, so it falls through', () => {
  assert.equal(readEnv('ADMIN_AGENT_IDS', { HOLLOWAY_ADMIN_AGENT_IDS: '', A2A_ADMIN_AGENT_IDS: 'a' }), 'a');
  assert.equal(readEnv('ADMIN_AGENT_IDS', { A2A_ADMIN_AGENT_IDS: '' }), undefined);
  assert.equal(readEnv('ADMIN_AGENT_IDS', {}), undefined);
});
