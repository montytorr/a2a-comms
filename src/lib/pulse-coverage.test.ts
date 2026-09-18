import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PULSE_KEYS } from '@/lib/pulse';

/**
 * Every dashboard page either subscribes to the pulse with a scope, or is named
 * here with a reason.
 *
 * CAIRN-152 shipped this guard on the sibling dashboard and it caught a page
 * while it was being written, which is the case it exists for. The failure it
 * prevents is quiet: a page that neither polls nor subscribes shows whatever was
 * true when it rendered, forever, and looks exactly like a page that is working.
 * The protocol inspector was in precisely that state - the debugging cockpit for
 * stale state, itself never updating.
 */
const ROOT = join(process.cwd(), 'src/app/(dashboard)');

const DELIBERATELY_STATIC: Record<string, string> = {
  'api-docs': 'reference; changes on deploy, not while you read it',
  changelog: 'reference; changes on deploy',
  security: 'reference; changes on deploy',
  'onboarding/agent': 'reference; changes on deploy',
  'onboarding/human': 'reference; changes on deploy',
  settings: 'only changes because you changed it, and it refreshes after its own writes',
  'kill-switch': 'carries its own state and its own last-updated line',
  users: 'admin list; refreshes after its own writes',
  agents: 'registry; the detail page is where live state is',
  'agents/register': 'a form',
  'projects/new': 'a form',
  'webhooks/register': 'a form',
  'admin/emails': 'a preview tool, driven entirely by its own inputs',
  feed: 'runs its own client-side stream in feed-client.tsx',
};

function dashboardPages(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = entry.name;
    if (entry.isDirectory()) {
      out.push(...dashboardPages(join(dir, name), prefix ? `${prefix}/${name}` : name));
    } else if (name === 'page.tsx') {
      out.push(prefix || '.');
    }
  }
  return out;
}

test('every dashboard page subscribes to the pulse or says why it does not', () => {
  const unaccounted: string[] = [];

  for (const page of dashboardPages(ROOT)) {
    const file = join(ROOT, page === '.' ? '' : page, 'page.tsx');
    const source = readFileSync(file, 'utf8');
    if (source.includes('<AutoRefresh')) continue;
    if (page in DELIBERATELY_STATIC) continue;
    unaccounted.push(page);
  }

  assert.deepEqual(
    unaccounted,
    [],
    `these pages neither subscribe nor are listed as deliberately static:\n  ${unaccounted.join('\n  ')}\n` +
      'Add <AutoRefresh watch={[...]}> or add an entry to DELIBERATELY_STATIC with a reason.'
  );
});

test('every subscribing page names a scope, and every key in it is real', () => {
  const problems: string[] = [];

  for (const page of dashboardPages(ROOT)) {
    const file = join(ROOT, page === '.' ? '' : page, 'page.tsx');
    const source = readFileSync(file, 'utf8');
    const tag = /<AutoRefresh([^>]*)>/.exec(source);
    if (!tag) continue;

    const watch = /watch=\{\[([^\]]*)\]\}/.exec(tag[1]!);
    if (!watch) {
      // Without a scope it falls back to watching everything, which refreshes a
      // contract page because an unrelated webhook was delivered.
      problems.push(`${page}: <AutoRefresh> with no watch scope`);
      continue;
    }

    const keys = watch[1]!.split(',').map((k) => k.trim().replace(/^'|'$/g, '')).filter(Boolean);
    if (keys.length === 0) problems.push(`${page}: empty watch scope`);
    for (const key of keys) {
      if (!(PULSE_KEYS as readonly string[]).includes(key)) {
        problems.push(`${page}: watches "${key}", which a2a_pulse() does not produce`);
      }
    }
  }

  assert.deepEqual(problems, [], problems.join('\n'));
});

test('the static list does not name pages that have since started subscribing', () => {
  // A stale exemption is how a page ends up documented as deliberately frozen
  // long after somebody fixed it.
  const stale: string[] = [];
  for (const page of Object.keys(DELIBERATELY_STATIC)) {
    const source = readFileSync(join(ROOT, page, 'page.tsx'), 'utf8');
    if (source.includes('<AutoRefresh')) stale.push(page);
  }
  assert.deepEqual(stale, [], `remove these from DELIBERATELY_STATIC: ${stale.join(', ')}`);
});
