import assert from 'node:assert/strict';
import test from 'node:test';

import { buildContentSecurityPolicy } from '@/lib/content-security-policy';

test('content security policy allows Supabase-hosted attachment previews', () => {
  const csp = buildContentSecurityPolicy();

  assert.match(csp, /img-src 'self' data: blob: https:\/\/doqhqukckkkqlihjtqnp\.supabase\.co/);
  assert.match(csp, /media-src 'self' blob: https:\/\/doqhqukckkkqlihjtqnp\.supabase\.co/);
  assert.match(csp, /frame-src 'self' https:\/\/doqhqukckkkqlihjtqnp\.supabase\.co/);
  assert.match(csp, /frame-ancestors 'none'/);
});

test('content security policy can relax frame ancestors for the email preview route only', () => {
  const csp = buildContentSecurityPolicy({ frameAncestors: "'self'" });

  assert.match(csp, /frame-ancestors 'self'/);
});
