import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildNotificationSummary,
  NOTIFICATION_PULSE_KEYS,
  resolveNotificationAgentScope,
  type DashboardNotificationItem,
  type NotificationKind,
} from '@/lib/dashboard-notifications';
import type { AuthUser } from '@/lib/auth-context';
import type { AuthActorContext } from '@/lib/auth-actor-context';

const read = (relPath: string) => readFileSync(path.join(process.cwd(), relPath), 'utf8');

const item = (id: string, kind: NotificationKind, createdAt: string): DashboardNotificationItem => ({
  id, kind, title: id, body: id, href: `/x/${id}`, createdAt,
});

const empty = { questions: [], blockers: [], contracts: [], tasks: [], projects: [], approvals: [] };

test('a single open agent question is both counted and listed', () => {
  // The production report: the badge said 1 (an open blocking question) while
  // the page said 0. Counts and list must come from the same arrays.
  const summary = buildNotificationSummary({
    ...empty,
    questions: [item('question-1', 'agent-question', '2026-09-23T08:32:57Z')],
  });

  assert.equal(summary.counts.total, 1);
  assert.equal(summary.counts.questions, 1);
  assert.equal(summary.items.length, 1);
  assert.equal(summary.items[0].href, '/x/question-1');
});

test('total always equals the number of listed items, and every category adds up', () => {
  const many = (prefix: string, kind: NotificationKind, n: number) =>
    Array.from({ length: n }, (_, i) => item(`${prefix}-${i}`, kind, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()));

  const summary = buildNotificationSummary({
    questions: many('q', 'agent-question', 25),
    blockers: many('b', 'task-blocked', 25),
    contracts: many('c', 'contract-invitation', 25),
    tasks: many('t', 'task-assigned', 25),
    projects: many('p', 'project-invitation', 25),
    approvals: many('a', 'approval-request', 25),
  });

  const { counts } = summary;
  assert.equal(counts.total, summary.items.length, 'no truncation: the page lists everything the badge counts');
  assert.equal(counts.total, counts.questions + counts.blockers + counts.contracts + counts.projects + counts.approvals);
  assert.equal(new Set(summary.items.map((i) => i.id)).size, summary.items.length);
});

test('items are newest first', () => {
  const summary = buildNotificationSummary({
    ...empty,
    approvals: [item('old', 'approval-request', '2026-01-01T00:00:00Z')],
    questions: [item('new', 'agent-question', '2026-09-23T00:00:00Z')],
  });
  assert.deepEqual(summary.items.map((i) => i.id), ['new', 'old']);
});

test('scope follows the acting agent when given an actor context, and never goes empty', () => {
  const user = { agentIds: ['a1', 'a2'] } as unknown as AuthUser;
  const actor = { user, agentScope: ['a2'] } as unknown as AuthActorContext;

  assert.deepEqual(resolveNotificationAgentScope(actor), ['a2']);
  assert.deepEqual(resolveNotificationAgentScope(user), ['a1', 'a2']);
  assert.equal(resolveNotificationAgentScope({ agentIds: [] } as unknown as AuthUser).length, 1);
});

test('badge route and notifications page read the same function with the same context', () => {
  const route = read('src/app/api/internal/notifications/route.ts');
  const page = read('src/app/(dashboard)/notifications/page.tsx');

  for (const source of [route, page]) {
    assert.match(source, /const auth = await getAuthActorContext\(\);/);
    assert.match(source, /getDashboardNotificationSummary\(auth\)/);
    assert.doesNotMatch(source, /getAuthUser\(/);
  }
  assert.match(page, /<NotificationCountsSync counts=\{counts\} \/>/);
});

test('the page refreshes on every domain a notification can come from', () => {
  const page = read('src/app/(dashboard)/notifications/page.tsx');
  const watch = /<AutoRefresh[^>]*watch=\{\[([^\]]*)\]\}/.exec(page);
  assert.ok(watch, 'notifications page must declare an inline watch scope');
  const keys = watch[1].split(',').map((k) => k.trim().replace(/^'|'$/g, ''));
  for (const key of NOTIFICATION_PULSE_KEYS) assert.ok(keys.includes(key), `page does not watch ${key}`);
});

test('every notification kind has a pill tone on the page', () => {
  const lib = read('src/lib/dashboard-notifications.ts');
  const page = read('src/app/(dashboard)/notifications/page.tsx');
  const kinds = [...lib.matchAll(/\| '([a-z-]+)'/g)].map((m) => m[1]);
  assert.ok(kinds.includes('agent-question'));
  for (const kind of kinds) assert.match(page, new RegExp(`'${kind}':`), `no pill tone for ${kind}`);
});

test('the shell refetches the badge on navigation instead of only once on mount', () => {
  const shell = read('src/components/dashboard-shell.tsx');
  assert.match(shell, /await fetchNotificationCounts\(controller\.signal\)/);
  assert.match(shell, /\}, \[pathname\]\);/);
  assert.match(shell, /setNotificationCounts: setCounts/);
});
