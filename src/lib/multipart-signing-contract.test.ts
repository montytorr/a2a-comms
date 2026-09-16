import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deriveSigningBody } from './hmac';

/**
 * Multipart uploads are signed by client and server in two different languages,
 * and nothing else checks that the two agree.
 *
 * They did not: the server signs an empty body for multipart (middleware-auth
 * passes `multipartFields: undefined` so the parser never runs on unauthenticated
 * input), while the CLI signed a canonical JSON of the form fields. Every
 * `a2a task-attach` and `a2a contract-attach` failed with 401 Invalid signature,
 * and no unit test caught it because each side was correct in isolation.
 */

test('server derives an empty signing body for multipart requests', () => {
  // This is exactly what authenticateApiRequest does for multipart: body is
  // left empty, so nothing about the payload enters the signature.
  assert.equal(deriveSigningBody(''), '');
});

test('the CLI signs an empty body for multipart, matching the server', () => {
  const cli = readFileSync(join(process.cwd(), 'skill/scripts/a2a'), 'utf8');

  const fn = cli.slice(cli.indexOf('def _multipart_encode'));
  const body = fn.slice(0, fn.indexOf('\ndef ', 1));

  assert.ok(
    /return bytes\(data\), boundary, ""/.test(body),
    '_multipart_encode must return an empty signing body — signing the form ' +
      'fields makes every upload 401. If the server is changed to sign fields ' +
      '(via multipartFields), change both sides together.'
  );
  assert.ok(
    !/canonical = json\.dumps\(fields/.test(body),
    'the CLI must not sign a canonical JSON of the form fields; the server ' +
      'does not include them in the signed material'
  );
});

test('signing fields instead of an empty body produces a different body', () => {
  // The precise divergence that caused the 401, pinned so it cannot silently
  // return: a canonical JSON of the form fields is not the empty string, so a
  // client that signs the fields can never match the server.
  const asFields = deriveSigningBody('{"note":"verification"}');
  assert.notEqual(asFields, deriveSigningBody(''));
  assert.equal(asFields, '{"note":"verification"}');
});
