import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContentSecurityPolicy } from '@/lib/content-security-policy';

test('CSP permits previews and realtime on the configured backend origin', () => {
  const csp = buildContentSecurityPolicy({ supabaseUrl: 'https://local.example/supabase' });
  assert.match(csp, /img-src 'self' data: blob: https:\/\/local\.example/);
  assert.match(csp, /media-src 'self' blob: https:\/\/local\.example/);
  assert.match(csp, /frame-src 'self' https:\/\/local\.example/);
  assert.match(csp, /connect-src 'self' https:\/\/local\.example wss:\/\/local\.example/);
  assert.ok(!csp.includes('/supabase'));
  assert.match(csp, /frame-ancestors 'none'/);
});

test('CSP supports local development and an explicit frame-ancestor override', () => {
  const csp = buildContentSecurityPolicy({ supabaseUrl: 'http://localhost:8000', frameAncestors: "'self'" });
  assert.match(csp, /ws:\/\/localhost:8000/);
  assert.match(csp, /frame-ancestors 'self'/);
});

test('CSP rejects non-HTTP backend schemes', () => {
  assert.throws(() => buildContentSecurityPolicy({ supabaseUrl: 'javascript:alert(1)' }), /HTTP/);
});
