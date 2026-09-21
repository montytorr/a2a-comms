import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { withApiHandler } from './api-handler';

test('withApiHandler turns an unexpected throw into a safe JSON 500', async () => {
  const handler = withApiHandler(async () => { throw new Error('secret'); }, 'test-route');
  const response = await handler(new NextRequest('http://localhost/test'), {});
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Internal server error', code: 'INTERNAL_ERROR' });
});

test('withApiHandler preserves typed client errors', async () => {
  const handler = withApiHandler(async () => {
    throw Object.assign(new Error('invalid value'), { status: 400, code: 'VALIDATION_ERROR' });
  }, 'test-route');
  const response = await handler(new NextRequest('http://localhost/test'), {});
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'invalid value', code: 'VALIDATION_ERROR' });
});
