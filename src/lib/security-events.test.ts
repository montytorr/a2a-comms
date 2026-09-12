import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthSuccessEvent } from './security-events';

test('auth success stores the service-key UUID as the audit resource', () => {
  const event = buildAuthSuccessEvent(
    '447b083d-d892-4ce0-87f7-e316bef38f20',
    'clawdius-prod',
    'Clawdius',
    '127.0.0.1',
  );

  assert.equal(event.resourceId, '447b083d-d892-4ce0-87f7-e316bef38f20');
  assert.deepEqual(event.details, { key_id: 'clawdius-prod' });
});
