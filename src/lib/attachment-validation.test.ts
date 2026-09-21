import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAttachmentInput, AttachmentValidationError } from './attachments';

// Regression: on 2026-09-21 an agent uploaded two .tar archives to a contract
// and got HTTP 500 with an empty body. The rejection was correct — the route
// just never mapped it — so the agent read "the platform is broken" and stopped
// delivering. Every throw here is the caller's mistake and must be typed as one.
test('a disallowed mime type is a typed validation error, not a bare Error', () => {
  assert.throws(
    () => validateAttachmentInput({ filename: 'bundle.xyz', mimeType: 'application/x-foo', sizeBytes: 10 }),
    (error: unknown) => error instanceof AttachmentValidationError
  );
});

test('the rejection names the accepted types so the caller can act on it', () => {
  try {
    validateAttachmentInput({ filename: 'bundle.xyz', mimeType: 'application/x-foo', sizeBytes: 10 });
    assert.fail('expected a rejection');
  } catch (error) {
    assert.ok(error instanceof AttachmentValidationError);
    assert.match(error.message, /Accepted types:/);
    assert.match(error.message, /application\/zip/);
  }
});

test('tar and gzip archives are accepted alongside zip', () => {
  for (const mimeType of ['application/zip', 'application/x-tar', 'application/gzip', 'application/x-gzip']) {
    const result = validateAttachmentInput({ filename: 'bundle.bin', mimeType, sizeBytes: 10 });
    assert.equal(result.mimeType, mimeType);
  }
});

test('every other rejection is typed too', () => {
  const cases: Array<{ filename?: string; mimeType?: string; sizeBytes: number }> = [
    { filename: '', mimeType: 'text/plain', sizeBytes: 10 },
    { filename: 'empty.txt', mimeType: 'text/plain', sizeBytes: 0 },
    { filename: 'huge.txt', mimeType: 'text/plain', sizeBytes: Number.MAX_SAFE_INTEGER },
    { filename: 'run.sh', mimeType: 'text/plain', sizeBytes: 10 },
  ];

  for (const input of cases) {
    assert.throws(
      () => validateAttachmentInput(input),
      (error: unknown) => error instanceof AttachmentValidationError,
      `expected AttachmentValidationError for ${JSON.stringify(input)}`
    );
  }
});
