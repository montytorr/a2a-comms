import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

/**
 * A deployment must never fall back to somebody else's deployment.
 *
 * Four call sites each carried their own `|| 'https://a2a.playground.…'`
 * fallback. Anyone deploying this without NEXT_PUBLIC_APP_URL sent project
 * invitations and blocker alerts whose links pointed at the author's install —
 * recipients clicking through to a stranger's data, with nothing but a log
 * warning to show for it.
 */
test('no deployment-specific host is hardcoded in shipped source', () => {
  // ripgrep the tracked source rather than walking it by hand, so a new file
  // is covered the day it is added.
  const hits = execFileSync(
    'git',
    ['grep', '-nIE', 'https?://[a-z0-9.-]*(montytorr|playground)[a-z0-9.-]*', '--', 'src', 'scripts', 'reactor'],
    { encoding: 'utf8', cwd: process.cwd() },
  ).trim().split('\n').filter(Boolean)
    // Tests may name a host deliberately; they ship nothing.
    .filter((line) => !/\.test\.[tj]sx?:/.test(line))
    // github.com/<owner>/<repo> is where the project lives, not where an
    // instance is deployed. Linking to it is correct.
    .filter((line) => !/https:\/\/github\.com\//.test(line));

  assert.deepEqual(hits, [], `hardcoded deployment host in shipped source:\n${hits.join('\n')}`);
});
