import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIVE_AGENT_COOKIES,
  SESSION_COOKIE,
  SESSION_COOKIES,
  readActiveAgentCookie,
  readSessionCookie,
} from './cookie';

const jar = (values: Record<string, string>) => ({
  get: (name: string) => (name in values ? { value: values[name] } : undefined),
});

test('new sessions are written under the holloway_ name', () => {
  assert.equal(SESSION_COOKIE, 'holloway_session');
});

test('a browser that logged in before the rename stays logged in', () => {
  assert.equal(readSessionCookie(jar({ a2a_session: 'old-token' })), 'old-token');
  assert.equal(readActiveAgentCookie(jar({ a2a_active_agent: 'agent-1' })), 'agent-1');
});

test('the new cookie wins when both are present', () => {
  assert.equal(readSessionCookie(jar({ holloway_session: 'new', a2a_session: 'old' })), 'new');
  assert.equal(readActiveAgentCookie(jar({ holloway_active_agent: 'b', a2a_active_agent: 'a' })), 'b');
});

test('no cookie, or an emptied one, is no session', () => {
  assert.equal(readSessionCookie(jar({})), undefined);
  assert.equal(readSessionCookie(jar({ holloway_session: '' })), undefined);
});

test('logout and clear cover both names', () => {
  assert.deepEqual([...SESSION_COOKIES], ['holloway_session', 'a2a_session']);
  assert.deepEqual([...ACTIVE_AGENT_COOKIES], ['holloway_active_agent', 'a2a_active_agent']);
});
