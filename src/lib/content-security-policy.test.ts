import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContentSecurityPolicy } from '@/lib/content-security-policy';

test('CSP permits previews on a configured backend origin', () => {
  const csp = buildContentSecurityPolicy({ backendUrl: 'https://local.example/backend' });
  assert.match(csp, /img-src 'self' data: blob: https:\/\/local\.example/);
  assert.match(csp, /media-src 'self' blob: https:\/\/local\.example/);
  assert.match(csp, /frame-src 'self' https:\/\/local\.example/);
  assert.match(csp, /connect-src 'self' https:\/\/local\.example wss:\/\/local\.example/);
  assert.ok(!csp.includes('/backend'));
  assert.match(csp, /frame-ancestors 'none'/);
});

test('CSP supports local development and an explicit frame-ancestor override', () => {
  const csp = buildContentSecurityPolicy({ backendUrl: 'http://localhost:8000', frameAncestors: "'self'" });
  assert.match(csp, /ws:\/\/localhost:8000/);
  assert.match(csp, /frame-ancestors 'self'/);
});

test('CSP rejects non-HTTP backend schemes', () => {
  assert.throws(() => buildContentSecurityPolicy({ backendUrl: 'javascript:alert(1)' }), /HTTP/);
});
