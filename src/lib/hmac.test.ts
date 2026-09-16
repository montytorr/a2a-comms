import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveSigningBody } from './hmac';

test('deriveSigningBody canonicalizes JSON payloads', () => {
  const body = deriveSigningBody('{"b":2,"a":1}');
  assert.equal(body, '{"a":1,"b":2}');
});

test('deriveSigningBody falls back to raw body for non-JSON requests', () => {
  const body = deriveSigningBody('plain-text-body');
  assert.equal(body, 'plain-text-body');
});

test('deriveSigningBody returns an empty string for an empty body', () => {
  // This is the multipart case: authenticateApiRequest leaves body empty so the
  // multipart parser never runs on unauthenticated input, which means the
  // payload is not signed. See multipart-signing-contract.test.ts, which pins
  // that the CLI agrees.
  assert.equal(deriveSigningBody(''), '');
});
