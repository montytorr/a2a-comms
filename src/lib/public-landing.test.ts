import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { SESSION_COOKIE } from '@/lib/auth/cookie';

/**
 * `/` is the one path where "not signed in" is not an error.
 *
 * AC-81: a public repository had nowhere to send someone who clicked through.
 * The bare domain 307'd to a login form for an account a stranger cannot
 * create, which is a strange thing for a project's only URL to do.
 *
 * The fix is a REWRITE rather than a redirect, so the homepage keeps the URL a
 * homepage should have, and it is one line in the middle of a gate that
 * protects every other route. Both halves of that are worth a test: the door
 * that opened, and the walls that must not have moved with it.
 */

const at = (path: string, signedIn = false) => {
  const request = new NextRequest(new URL(`https://a2a.example${path}`));
  if (signedIn) request.cookies.set(SESSION_COOKIE, 'a-session');
  return proxy(request);
};

test('a stranger at the bare domain gets the landing page, not a login form', async () => {
  const response = await at('/');
  assert.equal(response.status, 200, 'a rewrite, so the address bar keeps the bare domain');
  assert.equal(response.headers.get('x-middleware-rewrite'), 'https://a2a.example/home');
  assert.equal(response.headers.get('location'), null, 'and no redirect');
});

test('/home is reachable directly, signed in or not', async () => {
  for (const signedIn of [false, true]) {
    const response = await at('/home', signedIn);
    assert.equal(response.headers.get('location'), null, `signedIn=${signedIn}`);
    assert.equal(response.headers.get('x-middleware-rewrite'), null);
  }
});

test('a signed-in visitor at / still gets their dashboard, unmoved', async () => {
  const response = await at('/', true);
  assert.equal(response.headers.get('x-middleware-rewrite'), null, 'nothing is rewritten for them');
  assert.equal(response.headers.get('location'), null);
});

test('the landing page did not open any other door', async () => {
  // The rewrite lives inside the `no session cookie` branch, one line above
  // the redirect that guards everything else. A regression there would be
  // silent: pages render, and only the wrong people can see them.
  for (const path of ['/contracts', '/settings', '/users', '/kill-switch', '/audit', '/homepage', '/home/x']) {
    const response = await at(path);
    const location = response.headers.get('location');
    assert.ok(location, `${path} must still require a session`);
    assert.match(location, /\/login\?redirect=/, `${path} should send you to log in`);
  }
});
