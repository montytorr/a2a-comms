import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeMultipartFields, deriveSigningBody } from './hmac';

test('canonicalizeMultipartFields sorts keys and omits undefined values', () => {
  const canonical = canonicalizeMultipartFields({
    note: 'hello',
    checkpoint_id: 'cp_123',
    run_id: undefined,
  });

  assert.equal(
    canonical,
    '{"checkpoint_id":"cp_123","note":"hello"}'
  );
});

test('deriveSigningBody canonicalizes JSON payloads', () => {
  const body = deriveSigningBody('{"b":2,"a":1}', undefined);
  assert.equal(body, '{"a":1,"b":2}');
});

test('deriveSigningBody canonicalizes multipart metadata payloads', () => {
  const body = deriveSigningBody('--raw multipart bytes--', {
    note: 'proof',
    checkpoint_id: 'cp_123',
  });
  assert.equal(body, '{"checkpoint_id":"cp_123","note":"proof"}');
});

test('deriveSigningBody falls back to raw body for non-JSON requests', () => {
  const body = deriveSigningBody('plain-text-body', undefined);
  assert.equal(body, 'plain-text-body');
});
