import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

// ---------------------------------------------------------------- the name ---
//
// We moved to the native PostgreSQL driver and then kept the name of the
// dependency we dropped: a `supabase/` directory holding migrations, a
// `src/lib/supabase/` holding two shims that wrap `pg` and `bcryptjs`, and a
// thousand `const supabase = createServerClient()` locals. A newcomer reading
// the tree concludes Supabase is required to run this, which for a public
// repository is a wrong first impression it cannot afford.
//
// It is gone. This is what keeps it gone: a rename is a one-off, a habit is
// not, and the next person to reach for a database handle has a thousand
// examples to copy from.
//
// The early migrations are exempt and always will be. They genuinely ran
// against Supabase, they reference `auth.*` and its three roles, and
// `scripts/migrate.sh` still creates those roles so a fresh database can
// replay history. Rewriting a migration to hide where it came from would be a
// lie told to make a grep quieter. `CHANGELOG.md` is exempt for the same
// reason: it records what happened.

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
};

test('the word Supabase appears nowhere in the application code', () => {
  const offenders: string[] = [];
  for (const dir of ['src', 'scripts']) {
    for (const path of walk(join(root, dir))) {
      if (!/\.(ts|tsx|js|mjs|sh)$/.test(path)) continue;
      const text = readFileSync(path, 'utf8');
      if (!/supabase/i.test(text)) continue;
      // migrate.sh and verify-e2e.sh explain why they create Supabase's roles
      // before replaying migrations that predate the move. That is a fact
      // about the migrations, not a dependency claim.
      if (/^(migrate|verify-e2e)\.sh$/.test(path.split('/').pop()!)) continue;
      // And this file, which cannot forbid a word without writing it.
      if (path.endsWith('release-hygiene.test.ts')) continue;
      offenders.push(path.slice(root.length + 1));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Supabase is not a dependency of this project. Name the handle \`db\`, and put shims under src/lib/db or src/lib/auth:\n  ${offenders.join('\n  ')}`,
  );
});

test('migrations live in migrations/, not under a vendor name', () => {
  assert.ok(existsSync(join(root, 'migrations')), 'migrations/ is where the migrations live');
  assert.ok(!existsSync(join(root, 'supabase')), 'supabase/ should not exist');
  assert.ok(!existsSync(join(root, 'src', 'lib', 'supabase')), 'src/lib/supabase/ should not exist');
});

// ------------------------------------------------------------- the release ---
//
// scripts/publish-release.sh reads a version's notes out of CHANGELOG.md
// rather than writing them again, so a release cannot claim something the
// changelog does not say. The cost of that choice is that a tag with no
// changelog section gets no release — quietly, in a step that is deliberately
// allowed to fail without failing a deploy. This is what makes that loud.

const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const notes = (version: string) =>
  execFileSync(join(root, 'scripts', 'release-notes.sh'), [version], { encoding: 'utf8' });

test('every tag has a CHANGELOG section to publish as its notes', { skip: !existsSync(join(root, '.git')) }, () => {
  const tags = execFileSync('git', ['tag', '--list', 'v*'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  assert.ok(tags.length > 0, 'a repository with releases has tags');

  const missing = tags.filter((tag) => !changelog.includes(`## [${tag.slice(1)}]`));
  assert.deepEqual(missing, [], `these tags would publish an empty release:\n  ${missing.join('\n  ')}`);
});

test('release notes are the changelog section and stop at the next version', () => {
  const version = changelog.match(/^## \[([\d.]+)\]/m)?.[1];
  assert.ok(version, 'CHANGELOG.md has at least one version heading');

  const body = notes(version!);
  assert.ok(!body.includes(`## [${version}]`), 'the heading is the release title, not part of its body');
  assert.ok(!/^## \[/m.test(body), 'a release must not carry the next release along with it');
  assert.ok(body.trim().length > 0, 'and it must not be empty');
  assert.equal(notes(`v${version}`), body, 'a leading v is accepted, since tags carry one');
});

test('a version with no changelog section fails rather than publishing nothing', () => {
  assert.throws(() => notes('0.0.0-nothing-here'), /status 1|Command failed/);
});
